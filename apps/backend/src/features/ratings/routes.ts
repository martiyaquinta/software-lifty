import { Elysia } from 'elysia';
import { authGuard } from '../../shared/middleware/require-auth';
import { rateTripBody, ratingTripParams } from './schema';
import { ratingsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const ratingsRoutes = new Elysia({ prefix: '/ratings' })
  .use(authGuard)
  .post(
    '/trips/:trip_id',
    ({ user, params, body, set }) =>
      safeCall(() => ratingsService.rateTrip(user, params.trip_id, body), set),
    { params: ratingTripParams, body: rateTripBody, requireAuth: true },
  );
