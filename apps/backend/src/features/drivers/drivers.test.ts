process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://lifty:lifty@localhost:5432/lifty_test';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { driverDocuments, drivers, refreshTokens, users, vehicles } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(driverDocuments);
  await db.delete(vehicles);
  await db.delete(drivers);
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
    .values({ phone, full_name: 'Juan Perez', role: 'driver', password_hash: 'unused' })
    .returning({ id: users.id });
  return createTestToken(user.id, 'driver');
}

async function fullOnboarding(phone: string, password: string) {
  const token = await registerAndGetToken(phone, password);
  const { data: step1Res } = await request(
    'POST',
    '/api/onboarding/step1',
    { full_name: 'Juan Perez' },
    token,
  );
  const driverId = step1Res.id;
  await request(
    'POST',
    '/api/onboarding/step2',
    { brand: 'Toyota', model: 'Corolla', year: 2022, color: 'Blanco', plate: 'ABC123' },
    token,
  );
  return { token, driverId };
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

describe('Driver Profile', () => {
  const phone = '+5492611111111';
  const password = 'testPass123';

  test('GET /:id/profile returns public profile', async () => {
    const { driverId } = await fullOnboarding(phone, password);

    const { status, data } = await request('GET', `/api/drivers/${driverId}/profile`);

    expect(status).toBe(200);
    expect(data.id).toBe(driverId);
    expect(data.full_name).toBe('Juan Perez');
    expect(data.avatar_url).toBeNull();
    expect(data.rating_avg).toBe(0);
    expect(data.total_trips).toBe(0);
    expect(data.kyc_verified).toBe(false);
    expect(data.vehicle.brand).toBe('Toyota');
    expect(data.vehicle.model).toBe('Corolla');
    expect(data.vehicle.year).toBe(2022);
    expect(data.vehicle.color).toBe('Blanco');
  });

  test('GET /:id/profile for non-existent driver returns 422', async () => {
    const { status, data } = await request(
      'GET',
      '/api/drivers/00000000-0000-0000-0000-000000000000/profile',
    );

    expect(status).toBe(404);
    expect(data.error).toBe('NOT_FOUND');
    expect(data.message).toBe('Driver not found');
  });

  test('GET /:id/profile without auth works (public endpoint)', async () => {
    const { driverId } = await fullOnboarding(phone, password);

    const { status, data } = await request('GET', `/api/drivers/${driverId}/profile`);

    expect(status).toBe(200);
    expect(data.id).toBe(driverId);
  });

  test('GET /me returns full profile', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);

    const { status, data } = await request('GET', '/api/drivers/me', undefined, token);

    expect(status).toBe(200);
    expect(data.id).toBe(driverId);
    expect(data.user_id).toBeString();
    expect(data.phone).toBe(phone);
    expect(data.email).toBeNull();
    expect(data.full_name).toBe('Juan Perez');
    expect(data.avatar_url).toBeNull();
    expect(data.status).toBe('step3');
    expect(data.kyc_status).toBe('pending');
    expect(data.rating_avg).toBe(0);
    expect(data.total_trips).toBe(0);
    expect(data.completion_rate).toBe(0);
    expect(data.is_online).toBe(false);
    expect(data.vehicle.brand).toBe('Toyota');
    expect(data.vehicle.model).toBe('Corolla');
    expect(data.vehicle.year).toBe(2022);
    expect(data.vehicle.color).toBe('Blanco');
    expect(data.vehicle.plate).toBe('ABC123');
    expect(data.vehicle.vehicle_type).toBe('car');
    expect(data.created_at).toBeString();
  });

  test('GET /me without auth returns 401', async () => {
    const { status, data } = await request('GET', '/api/drivers/me');

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('GET /me without driver row returns onboarding status', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request('GET', '/api/drivers/me', undefined, token);

    expect(status).toBe(200);
    expect(data.step).toBe('step1');
    expect(data.message).toBe('Onboarding not started');
  });

  test('GET /:id/profile includes kyc_verified badge', async () => {
    const { driverId } = await fullOnboarding(phone, password);

    const db = getDb();
    await db.update(drivers).set({ kyc_status: 'approved' }).where(eq(drivers.id, driverId));

    const { status, data } = await request('GET', `/api/drivers/${driverId}/profile`);

    expect(status).toBe(200);
    expect(data.kyc_verified).toBe(true);
  });

  test('PUT /me/online toggles status', async () => {
    const token = await registerAndGetToken(phone, password);
    await request('POST', '/api/onboarding/step1', { full_name: 'Test' }, token);

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );
    expect(status).toBe(200);
    expect(data.is_online).toBe(true);
    expect(data.message).toContain('online');

    const { status: s2, data: d2 } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: false },
      token,
    );
    expect(s2).toBe(200);
    expect(d2.is_online).toBe(false);

    const db = getDb();
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    const [driver] = await db
      .select({ is_online: drivers.is_online })
      .from(drivers)
      .where(eq(drivers.user_id, user!.id))
      .limit(1);
    expect(driver.is_online).toBe(false);
  });

  test('PUT /me/online without auth returns 401', async () => {
    const { status, data } = await request('PUT', '/api/drivers/me/online', { is_online: true });
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('PUT /me/online without driver row returns error', async () => {
    const token = await registerAndGetToken(phone, password);
    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );
    expect(status).toBe(404);
    expect(data.message).toContain('Onboarding');
  });

  test('GET /me includes vehicle data', async () => {
    const { token } = await fullOnboarding(phone, password);

    const { status, data } = await request('GET', '/api/drivers/me', undefined, token);

    expect(status).toBe(200);
    expect(data.vehicle.brand).toBe('Toyota');
    expect(data.vehicle.model).toBe('Corolla');
    expect(data.vehicle.year).toBe(2022);
    expect(data.vehicle.color).toBe('Blanco');
    expect(data.vehicle.plate).toBe('ABC123');
    expect(data.vehicle.vehicle_type).toBe('car');
  });
});
