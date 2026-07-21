import { Elysia } from 'elysia';
import { authGuard } from '../../shared/middleware/require-auth';
import { collectBody, createTripBody, rateTripBody, tripIdParams } from './schema';
import { tripService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const tripRoutes = new Elysia({ prefix: '/trips' })
  .use(authGuard)
  .post('/', ({ user, body, set }) => safeCall(() => tripService.createTrip(user, body), set), {
    body: createTripBody,
    requireAuth: true,
  })
  .get('/active', ({ user, set }) => safeCall(() => tripService.getActiveTrip(user), set), {
    requireAuth: true,
  })
  .get(
    '/history',
    ({ user, query, set }) =>
      safeCall(
        () => tripService.getTripHistory(user, Number(query.page) || 1, Number(query.limit) || 20),
        set,
      ),
    { requireAuth: true },
  )
  .get(
    '/:id',
    ({ user, params, set }) => safeCall(() => tripService.getTripById(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/accept',
    ({ user, params, set }) => safeCall(() => tripService.acceptTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/reject',
    ({ user, params, set }) => safeCall(() => tripService.rejectTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/en-route',
    ({ user, params, set }) => safeCall(() => tripService.enRouteTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/arrived',
    ({ user, params, set }) => safeCall(() => tripService.arrivedTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/start',
    ({ user, params, set }) => safeCall(() => tripService.startTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/complete',
    ({ user, params, set }) => safeCall(() => tripService.completeTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/cancel',
    ({ user, params, set }) => safeCall(() => tripService.cancelTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/rate',
    ({ user, params, body, set }) =>
      safeCall(
        () => tripService.rateTrip(user, params.id, body.rating, body.comment, body.tags),
        set,
      ),
    { params: tripIdParams, body: rateTripBody, requireAuth: true },
  )
  .put(
    '/:id/collect',
    ({ user, params, body, set }) =>
      safeCall(() => tripService.collectTrip(user, params.id, body.payment_method), set),
    { params: tripIdParams, body: collectBody, requireAuth: true },
  );
