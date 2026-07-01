import { Elysia } from 'elysia';
import { createAccidentBody, createSosBody } from './schema';
import { sosService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const sosRoutes = new Elysia({ prefix: '/sos' })
  .post(
    '/',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => sosService.createSos(user, body), set);
    },
    { body: createSosBody },
  )
  .post(
    '/accident',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => sosService.createAccident(user, body), set);
    },
    { body: createAccidentBody },
  );
