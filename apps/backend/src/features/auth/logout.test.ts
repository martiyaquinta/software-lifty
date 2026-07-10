process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb } from '../../shared/db/client';
import { refreshTokens, users } from '../../shared/db/schema';
import { getRedis } from '../../shared/lib/redis';
import { createTestToken } from '../../shared/testing/utils';

const redis = getRedis();
const describeOrSkip = redis ? describe : describe.skip;

async function request(app: any, method: string, path: string, token: string) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  const res = await app.handle(req);
  return { status: res.status, data: await res.json() };
}

describeOrSkip('Auth logout — access token revocation', () => {
  const db = getDb();

  beforeEach(async () => {
    await db.delete(refreshTokens);
    await db.delete(users);
    if (redis) {
      const keys = await redis.keys('blacklist:access:*');
      if (keys.length > 0) await redis.del(...keys);
    }
  });

  test('access token stops working after logout', async () => {
    const app = createApp();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492610000001', role: 'driver', password_hash: 'unused' })
      .returning({ id: users.id });
    const token = await createTestToken(user.id, 'driver');

    const before = await request(app, 'GET', '/api/auth/me', token);
    expect(before.status).toBe(200);

    const logout = await request(app, 'POST', '/api/auth/logout', token);
    expect(logout.status).toBe(200);

    const after = await request(app, 'GET', '/api/auth/me', token);
    expect(after.status).toBe(401);
  });

  afterAll(async () => {
    await db.delete(refreshTokens);
    await db.delete(users);
  });
});
