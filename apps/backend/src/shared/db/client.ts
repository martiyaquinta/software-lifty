import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { logger } from '../lib/logger';

let cachedPool: Pool | null = null;
let cachedDb: NodePgDatabase | null = null;

export function getDb(): NodePgDatabase {
  if (!cachedDb) {
    cachedPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      maxUses: 7500,
      allowExitOnIdle: true,
    });
    cachedDb = drizzle(cachedPool);
  }
  return cachedDb;
}

export function getPool(): Pool | null {
  return cachedPool;
}

export function resetDb() {
  cachedPool?.end().catch((err) => {
    logger.error('[DB] Error closing pool', { error: (err as Error).message });
  });
  cachedPool = null;
  cachedDb = null;
}

export const db = new Proxy({} as NodePgDatabase, {
  get(_target, prop: string | symbol) {
    const instance = getDb();
    return (instance as unknown as Record<string | symbol, unknown>)[prop as string | symbol];
  },
}) as unknown as NodePgDatabase;
