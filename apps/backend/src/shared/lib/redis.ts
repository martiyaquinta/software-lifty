import { Redis } from 'ioredis';
import { logger } from './logger';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  const REDIS_URL = process.env.REDIS_URL;
  if (!REDIS_URL) return null;
  if (!redis) {
    const instance = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: false,
    });
    instance.on('error', (err) => {
      logger.error('[REDIS]', 'Connection error:', err.message);
    });
    instance.on('ready', () => {
      logger.info('[REDIS]', 'Connected');
    });
    instance.on('end', () => {
      logger.warn('[REDIS]', 'Connection closed — will reconnect on next use');
      if (redis === instance) redis = null;
    });
    redis = instance;
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    const instance = redis;
    redis = null;
    try {
      await instance.quit();
    } catch {
      instance.disconnect();
    }
  }
}
