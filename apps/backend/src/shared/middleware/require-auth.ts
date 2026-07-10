import { Elysia } from 'elysia';
import { authPlugin } from './auth';

export const authGuard = new Elysia({ name: 'auth-guard' }).use(authPlugin).macro({
  requireAuth(enabled: boolean) {
    if (!enabled) return {};
    return {
      resolve({ user, authStatus, status }) {
        if (!user) {
          if (authStatus === 'token_expired') {
            return status(401, {
              error: 'Unauthorized',
              code: 'TOKEN_EXPIRED',
              message: 'Token expired, please refresh',
            });
          }
          return status(401, { error: 'Unauthorized', code: 'TOKEN_REQUIRED' });
        }
        return { user };
      },
    };
  },
});
