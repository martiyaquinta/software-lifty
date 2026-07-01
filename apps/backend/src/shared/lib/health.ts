import type { PgDatabase } from 'drizzle-orm/pg-core';
import { getDb } from '../db/client';
import { logger } from './logger';
import { getRedis } from './redis';

let redisMigrated = false;

async function migrateIfNeeded(db: PgDatabase<any>) {
  if (redisMigrated) return;
  try {
    const result = await db.execute(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '__drizzle_migrations')",
    );
    logger.debug('[READY] Migration check passed');
    redisMigrated = true;
  } catch {
    // migrations table may not exist yet in fresh DB
  }
}

export async function runReadyChecks(): Promise<{ ready: boolean; reason?: string }> {
  try {
    const db = getDb();
    await db.execute('SELECT 1');
    await migrateIfNeeded(db);
  } catch (err) {
    return { ready: false, reason: `DB: ${(err as Error).message}` };
  }

  const redis = getRedis();
  if (redis) {
    try {
      await redis.ping();
    } catch (err) {
      return { ready: false, reason: `Redis: ${(err as Error).message}` };
    }
  }

  return { ready: true };
}
