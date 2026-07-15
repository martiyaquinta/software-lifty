process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { users } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';
let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(users);
}

async function request(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await app.handle(req);
  const data = await res.json();
  return { status: res.status, data };
}

async function registerAndGetToken(phone: string, _password: string): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });
  return createTestToken(user.id);
}

beforeAll(async () => {
  app = createApp();
  // Self-seed: districts normally come from migration 0007 / db:seed,
  // but the test DB may have been created via drizzle-kit push (no data).
  const db = getDb();
  const existing: any = await db.execute('SELECT count(*) AS count FROM districts');
  if (Number(existing.rows[0]?.count ?? 0) === 0) {
    await db.execute(`
      INSERT INTO "districts" (name, province, status) VALUES
        ('Villa Dolores', 'Córdoba', 'active'),
        ('Mina Clavero', 'Córdoba', 'active')
    `);
  }
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Districts', () => {
  const phone = '+5492615555555';
  const password = 'testPass123';

  test('GET /districts returns active districts', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request('GET', '/api/districts', undefined, token);

    expect(status).toBe(200);
    expect(data.districts).toBeArray();
    expect(data.districts.length).toBeGreaterThanOrEqual(1);

    for (const d of data.districts) {
      expect(d.id).toBeString();
      expect(d.name).toBeString();
      expect(d.province).toBeString();
    }

    const names = data.districts.map((d: any) => d.name);
    expect(names).toContain('Villa Dolores');
    expect(names).toContain('Mina Clavero');
  });

  test('GET /districts without auth returns 401', async () => {
    const { status, data } = await request('GET', '/api/districts');

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
});
