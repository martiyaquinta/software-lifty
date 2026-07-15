import { Elysia } from 'elysia';
import { logger } from '../../shared/lib/logger';
import { safeCall } from '../../shared/lib/route-utils';
import { authGuard } from '../../shared/middleware/require-auth';
import { authService } from './service';

export const authRoutes = new Elysia({ prefix: '/auth' })
  .use(authGuard)
  .get('/me', ({ user, set }) => safeCall(() => authService.getMe(user), set), {
    requireAuth: true,
  })
  .post(
    '/logout',
    ({ user, set }) => {
      logger.info('[AUTH:ROUTE] POST /auth/logout');
      return safeCall(() => authService.logout(user), set);
    },
    {
      requireAuth: true,
    },
  );
