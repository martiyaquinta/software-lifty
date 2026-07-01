import { Redis } from 'ioredis';
import { logger } from './logger';

let redis: Redis | null = null;
const REDIS_URL = process.env.REDIS_URL;

export function getRedis(): Redis | null {
  if (!REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: false,
    });
    redis.on('error', (err) => {
      logger.error('[REDIS]', 'Connection error:', err.message);
    });
    redis.on('connect', () => {
      logger.info('[REDIS]', 'Connected');
    });
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
