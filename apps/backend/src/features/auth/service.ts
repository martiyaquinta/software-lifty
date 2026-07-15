import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { users } from '../../shared/db/schema';
import { NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import type { AuthUser } from '../../shared/middleware/auth';

export const authService = {
  async getMe(user: AuthUser) {
    const [row] = await db
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

    if (!row) throw new NotFoundError('User not found');

    return {
      id: row.id,
      phone: row.phone,
      email: row.email,
      role: row.role,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      created_at: row.created_at?.toISOString() ?? null,
    };
  },

  async logout(user: AuthUser) {
    logger.info('[AUTH] Logout', { userId: user.id.split('-')[0] });
    return { message: 'Logged out successfully' };
  },
};
