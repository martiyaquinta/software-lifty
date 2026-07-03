import { Elysia } from 'elysia';
import { addDocumentBody, driverIdParams, toggleOnlineBody, updateProfileBody } from './schema';
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
  .get('/me/status', ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return safeCall(() => driversService.getMyStatus(user), set);
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
  )
  .put(
    '/me',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => driversService.updateProfile(user, body), set);
    },
    { body: updateProfileBody },
  )
  .post(
    '/me/documents',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => driversService.addDocument(user, body), set);
    },
    { body: addDocumentBody },
  );
