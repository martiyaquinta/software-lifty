process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { districts as districtsTable, drivers as driversTable, users } from '../../shared/db/schema';
import { createTestAuthPlugin, createTestToken } from '../../shared/testing/utils';
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

let districtId: string;

beforeAll(async () => {
  app = createApp(createTestAuthPlugin());
  const db = getDb();

  const existing: any = await db.execute('SELECT count(*) AS count FROM districts WHERE terms_and_conditions IS NOT NULL');
  if (Number(existing.rows[0]?.count ?? 0) === 0) {
    await db.execute(`UPDATE "districts" SET terms_and_conditions = 'Terms here', privacy_policy = 'Privacy here' WHERE name = 'Villa Dolores'`);
  }
  const [d] = await db
    .select({ id: districtsTable.id })
    .from(districtsTable)
    .where(eq(districtsTable.name, 'Villa Dolores'))
    .limit(1);
  districtId = d.id;
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

async function setupApprovedDriver(phone: string): Promise<{ token: string; driverId: string }> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });

  const token = createTestToken(user.id);

  const [driver] = await db
    .insert(driversTable)
    .values({ user_id: user.id, status: 'approved' })
    .returning({ id: driversTable.id });

  return { token, driverId: driver.id };
}

describe('Driver District', () => {
  test('PUT /drivers/me/district sets district for approved driver', async () => {
    const { token } = await setupApprovedDriver('+5492611111111');

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/district',
      { district_id: districtId },
      token,
    );

    expect(status).toBe(200);
    expect(data.district_id).toBe(districtId);
    expect(data.district_name).toBe('Villa Dolores');
    expect(data.district_province).toBe('Córdoba');
  });

  test('PUT /drivers/me/district with invalid id returns 404', async () => {
    const { token } = await setupApprovedDriver('+5492612222222');

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/district',
      { district_id: '00000000-0000-0000-0000-000000000000' },
      token,
    );

    expect(status).toBe(404);
    expect(data.error.code).toBe('DISTRICT_NOT_FOUND');
  });

  test('PUT /drivers/me/district twice returns 409', async () => {
    const { token } = await setupApprovedDriver('+5492613333333');

    await request('PUT', '/api/drivers/me/district', { district_id: districtId }, token);
    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/district',
      { district_id: districtId },
      token,
    );

    expect(status).toBe(409);
    expect(data.error.code).toBe('DISTRICT_ALREADY_SET');
  });

  test('GET /drivers/me/status returns has_district after set', async () => {
    const { token } = await setupApprovedDriver('+5492614444444');

    await request('PUT', '/api/drivers/me/district', { district_id: districtId }, token);
    const { status, data } = await request('GET', '/api/drivers/me/status', undefined, token);

    expect(status).toBe(200);
    expect(data.has_district).toBe(true);
    expect(data.district.name).toBe('Villa Dolores');
  });

  test('GET /drivers/me/status returns has_district false before set', async () => {
    const { token } = await setupApprovedDriver('+5492615555555');

    const { status, data } = await request('GET', '/api/drivers/me/status', undefined, token);

    expect(status).toBe(200);
    expect(data.has_district).toBe(false);
    expect(data.district).toBeUndefined();
  });

  test('PUT /drivers/me/district without auth returns 401', async () => {
    const { status } = await request('PUT', '/api/drivers/me/district', { district_id: districtId });

    expect(status).toBe(401);
  });
});
