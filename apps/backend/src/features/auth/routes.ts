import { Elysia } from 'elysia';
import { logger } from '../../shared/lib/logger';
import { safeCall } from '../../shared/lib/route-utils';
import { authService } from './service';

export const authRoutes = new Elysia({ prefix: '/auth' })
  .get('/me', ({ user, authStatus, set }) => {
    if (!user) {
      set.status = 401;
      if (authStatus === 'token_expired') {
        return {
          error: 'Unauthorized',
          code: 'TOKEN_EXPIRED',
          message: 'Token expired, please refresh',
        };
      }
      return { error: 'Unauthorized', code: 'TOKEN_REQUIRED' };
    }
    return safeCall(() => authService.getMe(user), set);
  })
  .post('/logout', ({ user, authStatus, set }) => {
    if (!user) {
      set.status = 401;
      if (authStatus === 'token_expired') {
        return {
          error: 'Unauthorized',
          code: 'TOKEN_EXPIRED',
          message: 'Token expired, please refresh',
        };
      }
      return { error: 'Unauthorized', code: 'TOKEN_REQUIRED' };
    }
    return safeCall(() => authService.logout(user), set);
  });
