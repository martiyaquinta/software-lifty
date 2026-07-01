import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { pushTokens } from '../../shared/db/schema';
import type { AuthUser } from '../../shared/middleware/auth';

export const notificationsService = {
  async registerToken(user: AuthUser, token: string, platform?: string) {
    const [existing] = await db
      .select({ id: pushTokens.id })
      .from(pushTokens)
      .where(eq(pushTokens.user_id, user.id))
      .limit(1);

    if (existing) {
      await db
        .update(pushTokens)
        .set({ token, platform: platform ?? 'android' })
        .where(eq(pushTokens.id, existing.id));
    } else {
      await db.insert(pushTokens).values({
        user_id: user.id,
        token,
        platform: platform ?? 'android',
      });
    }
    return { message: 'Token registered' };
  },

  async removeToken(user: AuthUser) {
    await db.delete(pushTokens).where(eq(pushTokens.user_id, user.id));
    return { message: 'Token removed' };
  },
};
