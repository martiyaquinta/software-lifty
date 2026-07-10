process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { SignJWT } from 'jose';
import { createApp } from '../../index';
import { getDb } from '../db/client';
import { refreshTokens, users } from '../db/schema';
import { createTestToken } from '../testing/utils';

async function makeRequest(
  app: any,
  path: string,
  token: string,
) {
  const req = new Request(`http://localhost${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const res = await app.handle(req);
  return { status: res.status, data: await res.json() };
}

describe('Auth middleware — auto-creation guard', () => {
  const db = getDb();

  beforeEach(async () => {
    await db.delete(refreshTokens);
    await db.delete(users);
  });

  test('authenticated with valid token for existing user', async () => {
    const app = createApp();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492610000000', role: 'driver', password_hash: 'unused' })
      .returning({ id: users.id });
    const token = await createTestToken(user.id, 'driver');

    const { status, data } = await makeRequest(app, '/api/auth/me', token);
    expect(status).toBe(200);
    expect(data.id).toBe(user.id);
  });

  test('REJECTS valid token for non-existent user — does NOT auto-create', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000000';
    const secret = new TextEncoder().encode(process.env.JWT_SECRET as string);
    const token = await new SignJWT({ sub: unknownId, role: 'driver' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .setIssuedAt()
      .sign(secret);

    const app = createApp();
    const { status } = await makeRequest(app, '/api/auth/me', token);
    expect(status).toBe(401);

    const dbUsers = await db.select({ id: users.id }).from(users);
    expect(dbUsers.length).toBe(0);
  });

  test('REJECTS valid token for non-existent user on protected API route', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000000';
    const secret = new TextEncoder().encode(process.env.JWT_SECRET as string);
    const token = await new SignJWT({ sub: unknownId, role: 'driver' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .setIssuedAt()
      .sign(secret);

    const app = createApp();
    const { status } = await makeRequest(app, '/api/drivers/me', token);
    expect(status).toBe(401);

    const dbUsers = await db.select({ id: users.id }).from(users);
    expect(dbUsers.length).toBe(0);
  });

  test('no_token when no authorization header', async () => {
    const app = createApp();
    const req = new Request('http://localhost/api/auth/me', { method: 'GET' });
    const res = await app.handle(req);
    expect(res.status).toBe(401);
  });

  test('token_invalid with malformed Bearer token', async () => {
    const app = createApp();
    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Authorization: 'Bearer not.a.real.jwt' },
    });
    const res = await app.handle(req);
    expect(res.status).toBe(401);
  });

  afterAll(async () => {
    await db.delete(refreshTokens);
    await db.delete(users);
  });
});
