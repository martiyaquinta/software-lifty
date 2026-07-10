import { Elysia } from 'elysia';
import { authGuard } from '../../shared/middleware/require-auth';
import { createAccidentBody, createSosBody } from './schema';
import { sosService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const sosRoutes = new Elysia({ prefix: '/sos' })
  .use(authGuard)
  .post('/', ({ user, body, set }) => safeCall(() => sosService.createSos(user, body), set), {
    body: createSosBody,
    requireAuth: true,
  })
  .post(
    '/accident',
    ({ user, body, set }) => safeCall(() => sosService.createAccident(user, body), set),
    { body: createAccidentBody, requireAuth: true },
  );
