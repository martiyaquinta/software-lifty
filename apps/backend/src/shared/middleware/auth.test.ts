process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { db } from '../db/client';
import { users } from '../db/schema';
import { getRedis } from '../lib/redis';
import { createTestAuthPlugin, createTestToken } from '../testing/utils';

let app: any;

function buildApp() {
  const plugin = createTestAuthPlugin();

  return new Elysia()
    .use(plugin)
    .get('/test', ({ user, authStatus }) => ({ user: user ?? null, authStatus }));
}

async function makeRequest(token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const req = new Request('http://localhost/test', { headers });
  const res = await app.handle(req);
  return res.json();
}

beforeEach(async () => {
  await db.delete(users);
  app = buildApp();

  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys('ratelimit:*');
      if (keys.length > 0) await redis.del(...keys);
    } catch { /* best-effort */ }
  }
});

afterAll(async () => {
  await db.delete(users);
});

describe('authPlugin', () => {
  test('returns no_token when no Authorization header', async () => {
    const res = await makeRequest();
    expect(res.user).toBeNull();
    expect(res.authStatus).toBe('no_token');
  });

  test('returns no_token when header is not Bearer', async () => {
    const headers: Record<string, string> = { 'Authorization': 'Basic abc123' };
    const req = new Request('http://localhost/test', { headers });
    const res = await app.handle(req);
    const data = await res.json();
    expect(data.user).toBeNull();
    expect(data.authStatus).toBe('no_token');
  });

  test('returns token_invalid for unknown user', async () => {
    const res = await makeRequest('non-existent-uuid');
    expect(res.user).toBeNull();
    expect(res.authStatus).toBe('token_invalid');
  });

  test('returns authenticated for known user', async () => {
    await db
      .insert(users)
      .values({ id: 'test-user-1', role: 'driver', phone: '+1234567890' })
      .returning();

    const token = createTestToken('test-user-1');
    const res = await makeRequest(token);
    expect(res.user).not.toBeNull();
    expect(res.user.id).toBe('test-user-1');
    expect(res.user.role).toBe('driver');
    expect(res.authStatus).toBe('authenticated');
  });
});
