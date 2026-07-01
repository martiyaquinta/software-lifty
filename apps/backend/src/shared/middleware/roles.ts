import type { AuthUser } from './auth';

export function requireRole(...roles: string[]) {
  return ({ user, set }: { user: AuthUser | null; set: { status: number } }) => {
    if (!user || !roles.includes(user.role)) {
      set.status = 403;
      return { error: 'Forbidden' };
    }
  };
}
