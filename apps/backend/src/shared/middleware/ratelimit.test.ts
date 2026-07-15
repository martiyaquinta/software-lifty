process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { resetDb } from '../db/client';
import { getRedis } from '../lib/redis';

const GLOBAL_MAX = 5;
let app: ReturnType<typeof createApp>;
const prevMax = process.env.RATE_LIMIT_MAX;
const prevWindow = process.env.RATE_LIMIT_WINDOW_MS;

async function clearRateLimitKeys() {
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys('ratelimit:*');
      if (keys.length > 0) await redis.del(...keys);
    } catch {
      /* best-effort */
    }
  }
}

beforeAll(() => {
  process.env.RATE_LIMIT_MAX = String(GLOBAL_MAX);
  process.env.RATE_LIMIT_WINDOW_MS = '60000';
  app = createApp();
});
beforeEach(async () => {
  await clearRateLimitKeys();
});
afterAll(async () => {
  await clearRateLimitKeys();
  if (prevMax === undefined) delete process.env.RATE_LIMIT_MAX;
  else process.env.RATE_LIMIT_MAX = prevMax;
  if (prevWindow === undefined) delete process.env.RATE_LIMIT_WINDOW_MS;
  else process.env.RATE_LIMIT_WINDOW_MS = prevWindow;
  resetDb();
});

describe('Global rate limiter', () => {
  test('exceeding the global limit returns 429', async () => {
    const ip = '198.51.100.42';
    const call = () =>
      app.handle(
        new Request('http://localhost/health', {
          method: 'GET',
          headers: { 'x-forwarded-for': ip },
        }),
      );

    for (let i = 0; i < 5; i++) {
      const res = await call();
      expect(res.status).toBe(200);
    }

    const limited = await call();
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as { error: string };
    expect(body.error).toBe('Too Many Requests');
  });

  test('also limits nested /api routes', async () => {
    const ip = '198.51.100.50';
    const call = () =>
      app.handle(
        new Request('http://localhost/api/drivers/00000000-0000-0000-0000-000000000000/profile', {
          method: 'GET',
          headers: { 'x-forwarded-for': ip },
        }),
      );

    let got429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await call();
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  });

  test('sets rate-limit headers on responses', async () => {
    const ip = '198.51.100.77';
    const res = await app.handle(
      new Request('http://localhost/health', {
        method: 'GET',
        headers: { 'x-forwarded-for': ip },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe(String(GLOBAL_MAX));
    expect(res.headers.get('X-RateLimit-Remaining')).toBe(String(GLOBAL_MAX - 1));
  });
});
