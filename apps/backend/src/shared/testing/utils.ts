process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.SUPABASE_JWT_SECRET = 'test-supabase-jwt-secret-at-least-32-chars!!';

import { SignJWT } from 'jose';
import { createApp } from '../../index';
import { getDb, resetDb } from '../db/client';
import { driverDocuments, drivers, refreshTokens, users, vehicles } from '../db/schema';

export async function createTestToken(userId: string, role = 'driver'): Promise<string> {
  const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
  return new SignJWT({ sub: userId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .setIssuedAt()
    .sign(secret);
}

export async function makeRequest(
  app: any,
  method: string,
  path: string,
  body?: object,
  token?: string,
  extraHeaders?: Record<string, string>,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (extraHeaders) Object.assign(headers, extraHeaders);
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await app.handle(req);
  const data = await res.json();
  return { status: res.status, data };
}

export async function registerAndGetToken(
  app: any,
  phone = '+5492611111111',
  _password = 'testPass123',
  fullName = 'Test Driver',
): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: fullName, role: 'driver', password_hash: 'unused' })
    .returning({ id: users.id });
  return createTestToken(user.id, 'driver');
}

export async function createDriver(
  app: any,
  token: string,
  data: Record<string, unknown> = {},
): Promise<string> {
  const { data: driver } = await makeRequest(
    app,
    'POST',
    '/api/onboarding/step1',
    {
      first_name: data.first_name || 'Test',
      last_name: data.last_name || 'Driver',
      birth_date: data.birth_date || '1990-01-01',
      gender: data.gender || 'male',
      phone: data.phone || '+5492611111111',
      ...data,
    },
    token,
  );
  return driver.driver_id;
}

export function createAppInstance() {
  return createApp();
}

export async function initTestSuite() {
  const app = createAppInstance();
  const db = getDb();

  async function truncateAll() {
    await db.delete(refreshTokens);
    await db.delete(vehicles);
    await db.delete(driverDocuments);
    await db.delete(drivers);
    await db.delete(users);
  }

  return {
    app,
    db,
    request: (method: string, path: string, body?: object, token?: string) =>
      makeRequest(app, method, path, body, token),
    truncateAll,
    register: (phone?: string, password?: string, fullName?: string) =>
      registerAndGetToken(app, phone, password, fullName),
    createDriver: (token: string, data?: Record<string, unknown>) => createDriver(app, token, data),
    cleanup: async () => {
      await truncateAll();
      resetDb();
    },
  };
}
