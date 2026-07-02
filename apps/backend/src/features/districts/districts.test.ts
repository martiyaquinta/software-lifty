process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://lifty:lifty@localhost:5432/lifty_test';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { refreshTokens, users } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';
let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(refreshTokens);
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
    .values({ phone, full_name: 'Test Driver', role: 'driver', password_hash: 'unused' })
    .returning({ id: users.id });
  return createTestToken(user.id, 'driver');
}

beforeAll(() => {
  app = createApp();
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
