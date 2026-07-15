import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import type { AuthUser } from '../middleware/auth';
import { createAuthPlugin } from '../middleware/auth';

export function createTestToken(userId: string): string {
  return userId;
}

export function createTestAuthPlugin() {
  return createAuthPlugin(async (token): Promise<AuthUser | null> => {
    const [row] = await db
      .select({
        id: users.id,
        role: users.role,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, token))
      .limit(1);

    return row ?? null;
  });
}
