import { Elysia } from 'elysia';
import { rateTripBody, ratingTripParams } from './schema';
import { ratingsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const ratingsRoutes = new Elysia({ prefix: '/ratings' }).post(
  '/trips/:trip_id',
  ({ user, params, body, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return safeCall(() => ratingsService.rateTrip(user, params.trip_id, body), set);
  },
  { params: ratingTripParams, body: rateTripBody },
);
