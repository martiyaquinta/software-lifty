process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb } from '../../shared/db/client';
import { users } from '../../shared/db/schema';
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

describeOrSkip('POST /api/auth/logout', () => {
  const db = getDb();

  beforeEach(async () => {
    await db.delete(users);
  });

  test('returns 401 without auth', async () => {
    const app = createApp();
    const req = new Request('http://localhost/api/auth/logout', { method: 'POST' });
    const res = await app.handle(req);
    expect(res.status).toBe(401);
  });

  test('returns success with valid auth', async () => {
    const app = createApp();
    const [user] = await db
      .insert(users)
      .values({ phone: '+5492610000001', role: 'driver' })
      .returning({ id: users.id });
    const token = createTestToken(user.id);

    const { status, data } = await request(app, 'POST', '/api/auth/logout', token);
    expect(status).toBe(200);
    expect(data.message).toBe('Logged out successfully');
  });

  afterAll(async () => {
    await db.delete(users);
  });
});
