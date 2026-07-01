import { Elysia } from 'elysia';
import { registerTokenBody } from './schema';
import { notificationsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const notificationsRoutes = new Elysia({ prefix: '/notifications' })
  .post(
    '/token',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(
        () => notificationsService.registerToken(user, body.token, body.platform),
        set,
      );
    },
    { body: registerTokenBody },
  )
  .delete('/token', ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return safeCall(() => notificationsService.removeToken(user), set);
  });
