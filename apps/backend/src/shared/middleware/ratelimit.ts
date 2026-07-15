import { Elysia } from 'elysia';
import { getRedis } from '../lib/redis';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  name: string;
  keyPrefix: string;
}

export function rateLimit(config?: Partial<RateLimitConfig>) {
  const windowMs = (config?.windowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS)) || 60_000;
  const max = (config?.max ?? Number(process.env.RATE_LIMIT_MAX)) || 60;
  const name = config?.name ?? 'rate-limit';
  const keyPrefix = config?.keyPrefix ?? 'ratelimit:ip';
  const redis = getRedis();

  if (!redis) {
    const store = new Map<string, { count: number; resetAt: number }>();

    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of store) {
        if (now > v.resetAt) store.delete(k);
      }
    }, 60_000);
    if (typeof cleanup === 'object' && 'unref' in cleanup) {
      (cleanup as any).unref();
    }

    return new Elysia({ name })
      .onBeforeHandle(({ request, set }) => {
        const rawForwarded = request.headers.get('x-forwarded-for');
        const ip = rawForwarded ? rawForwarded.split(',')[0].trim() : '127.0.0.1';
        const now = Date.now();
        let entry = store.get(ip);
        if (!entry || now > entry.resetAt) {
          entry = { count: 0, resetAt: now + windowMs };
          store.set(ip, entry);
        }
        entry.count++;
        set.headers['X-RateLimit-Limit'] = String(max);
        set.headers['X-RateLimit-Remaining'] = String(Math.max(0, max - entry.count));
        set.headers['X-RateLimit-Reset'] = String(Math.ceil(entry.resetAt / 1000));
        if (entry.count > max) {
          set.status = 429;
          return { error: 'Too Many Requests', message: 'Rate limit exceeded' };
        }
      })
      .as('scoped');
  }

  return new Elysia({ name })
    .onBeforeHandle(async ({ request, set }) => {
      const rawForwarded = request.headers.get('x-forwarded-for');
      const ip = rawForwarded ? rawForwarded.split(',')[0].trim() : '127.0.0.1';
      const key = `${keyPrefix}:${ip}`;
      const windowSeconds = Math.ceil(windowMs / 1000);

      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      const ttl = await redis.ttl(key);
      const remaining = Math.max(0, max - count);
      const resetAt = Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : windowSeconds);

      set.headers['X-RateLimit-Limit'] = String(max);
      set.headers['X-RateLimit-Remaining'] = String(remaining);
      set.headers['X-RateLimit-Reset'] = String(resetAt);

      if (count > max) {
        set.status = 429;
        return { error: 'Too Many Requests', message: 'Rate limit exceeded' };
      }
    })
    .as('scoped');
}
