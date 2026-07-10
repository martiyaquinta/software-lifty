import { Elysia } from 'elysia';
import { authGuard } from '../../shared/middleware/require-auth';
import { registerTokenBody } from './schema';
import { notificationsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const notificationsRoutes = new Elysia({ prefix: '/notifications' })
  .use(authGuard)
  .post(
    '/token',
    ({ user, body, set }) =>
      safeCall(() => notificationsService.registerToken(user, body.token, body.platform), set),
    { body: registerTokenBody, requireAuth: true },
  )
  .delete(
    '/token',
    ({ user, set }) => safeCall(() => notificationsService.removeToken(user), set),
    {
      requireAuth: true,
    },
  );
