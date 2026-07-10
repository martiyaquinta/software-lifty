process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { SignJWT } from 'jose';
import { Elysia } from 'elysia';
import { getDb, resetDb } from '../db/client';
import { refreshTokens, users } from '../db/schema';
import { createTestToken } from '../testing/utils';
import { authPlugin } from './auth';
import { authGuard } from './require-auth';

const protectedRoutes = new Elysia()
  .use(authGuard)
  .get('/protected', ({ user }) => ({ id: user.id }), { requireAuth: true });

const app = new Elysia().use(authPlugin).group('/api', (a) => a.use(protectedRoutes));

async function makeRequest(headers: Record<string, string> = {}) {
  const req = new Request('http://localhost/api/protected', { method: 'GET', headers });
  const res = await app.handle(req);
  return { status: res.status, data: await res.json() };
}

describe('requireAuth macro', () => {
  const db = getDb();

  beforeAll(async () => {
    await db.delete(refreshTokens);
    await db.delete(users);
  });

  beforeEach(async () => {
    await db.delete(refreshTokens);
    await db.delete(users);
  });

  afterAll(async () => {
    await db.delete(refreshTokens);
    await db.delete(users);
    resetDb();
  });

  test('401 TOKEN_REQUIRED when no authorization header', async () => {
    const { status, data } = await makeRequest();
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
    expect(data.code).toBe('TOKEN_REQUIRED');
  });

  test('401 TOKEN_REQUIRED with malformed token', async () => {
    const { status, data } = await makeRequest({ Authorization: 'Bearer not.a.real.jwt' });
    expect(status).toBe(401);
    expect(data.code).toBe('TOKEN_REQUIRED');
  });

  test('401 TOKEN_EXPIRED with expired token', async () => {
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492610000001', role: 'driver', password_hash: 'unused' })
      .returning({ id: users.id });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET as string);
    const expired = await new SignJWT({ sub: user.id, role: 'driver' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret);

    const { status, data } = await makeRequest({ Authorization: `Bearer ${expired}` });
    expect(status).toBe(401);
    expect(data.code).toBe('TOKEN_EXPIRED');
  });

  test('200 with narrowed user for a valid token', async () => {
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492610000002', role: 'driver', password_hash: 'unused' })
      .returning({ id: users.id });
    const token = await createTestToken(user.id, 'driver');

    const { status, data } = await makeRequest({ Authorization: `Bearer ${token}` });
    expect(status).toBe(200);
    expect(data.id).toBe(user.id);
  });
});
