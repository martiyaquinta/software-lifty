import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { refreshTokens, users } from '../../shared/db/schema';
import { NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import type { AuthUser } from '../../shared/middleware/auth';

export const authService = {
  async getMe(user: AuthUser) {
    const [dbUser] = await db
      .select({
        id: users.id,
        phone: users.phone,
        email: users.email,
        role: users.role,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
        created_at: users.created_at,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!dbUser) throw new NotFoundError('User not found');

    return {
      id: dbUser.id,
      phone: dbUser.phone,
      email: dbUser.email,
      role: dbUser.role,
      full_name: dbUser.full_name,
      avatar_url: dbUser.avatar_url,
      created_at: dbUser.created_at?.toISOString() ?? null,
    };
  },

  async logout(user: AuthUser) {
    await db.delete(refreshTokens).where(eq(refreshTokens.user_id, user.id));
    logger.info('[AUTH] Logout — all refresh tokens revoked', { userId: user.id.split('-')[0] });
    return { message: 'Logged out successfully' };
  },
};
