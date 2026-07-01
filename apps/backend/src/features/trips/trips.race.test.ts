import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, resetDb } from '../../shared/db/client';
import { refreshTokens, users } from '../../shared/db/schema';

let db: ReturnType<typeof getDb>;

beforeAll(() => {
  db = getDb();
});

beforeEach(async () => {
  await db.delete(refreshTokens);
  await db.delete(users);
});

afterAll(async () => {
  await db.delete(refreshTokens);
  await db.delete(users);
  resetDb();
});

describe('Race Conditions — Concurrent DB Operations', () => {
  test('concurrent insert operations complete without deadlock', async () => {
    const userIds = Array(10)
      .fill(null)
      .map(() => crypto.randomUUID());
    const phone = '+5492611000000';

    const inserts = userIds.map((id, i) =>
      db
        .insert(users)
        .values({
          id,
          phone: `${phone}${i}`,
          password_hash: 'hash12345678901234567890',
          role: 'driver',
        })
        .returning(),
    );

    const results = await Promise.all(inserts);
    const ids = results.map((r) => r[0].id);
    expect(new Set(ids).size).toBe(10);
  });

  test('concurrent reads after insert see consistent data', async () => {
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      phone: '+5492611000000',
      password_hash: 'hash12345678901234567890',
      role: 'driver',
    });

    const reads = Array(50)
      .fill(null)
      .map(() => db.select().from(users).where(eq(users.id, id)).limit(1));

    const results = await Promise.all(reads);
    for (const r of results) {
      expect(r.length).toBe(1);
      expect(r[0].id).toBe(id);
    }
  });
});
