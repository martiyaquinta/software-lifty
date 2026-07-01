import { Elysia } from 'elysia';
import { driverIdParams, toggleOnlineBody } from './schema';
import { driversService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const driversRoutes = new Elysia({ prefix: '/drivers' })
  .get(
    '/:id/profile',
    ({ params: { id }, set }) => {
      return safeCall(() => driversService.getPublicProfile(id), set);
    },
    { params: driverIdParams },
  )
  .get('/me', ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return safeCall(() => driversService.getMyProfile(user), set);
  })
  .put(
    '/me/online',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => driversService.toggleOnline(user, body.is_online), set);
    },
    { body: toggleOnlineBody },
  );
