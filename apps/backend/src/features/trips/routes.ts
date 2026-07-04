import { Elysia } from 'elysia';
import { createTripBody, rateTripBody, tripIdParams } from './schema';
import { tripService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const tripRoutes = new Elysia({ prefix: '/trips' })
  .post(
    '/',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => tripService.createTrip(user, body), set);
    },
    { body: createTripBody },
  )
  .get('/active', ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return safeCall(() => tripService.getActiveTrip(user), set);
  })
  .get('/history', ({ user, query, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return safeCall(
      () => tripService.getTripHistory(user, Number(query.page) || 1, Number(query.limit) || 20),
      set,
    );
  })
  .get(
    '/:id',
    ({ user, params, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => tripService.getTripById(user, params.id), set);
    },
    { params: tripIdParams },
  )
  .post(
    '/:id/accept',
    ({ user, params, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => tripService.acceptTrip(user, params.id), set);
    },
    { params: tripIdParams },
  )
  .post(
    '/:id/reject',
    ({ user, params, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => tripService.rejectTrip(user, params.id), set);
    },
    { params: tripIdParams },
  )
  .post(
    '/:id/en-route',
    ({ user, params, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => tripService.enRouteTrip(user, params.id), set);
    },
    { params: tripIdParams },
  )
  .post(
    '/:id/arrived',
    ({ user, params, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => tripService.arrivedTrip(user, params.id), set);
    },
    { params: tripIdParams },
  )
  .post(
    '/:id/start',
    ({ user, params, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => tripService.startTrip(user, params.id), set);
    },
    { params: tripIdParams },
  )
  .post(
    '/:id/complete',
    ({ user, params, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => tripService.completeTrip(user, params.id), set);
    },
    { params: tripIdParams },
  )
  .post(
    '/:id/cancel',
    ({ user, params, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => tripService.cancelTrip(user, params.id), set);
    },
    { params: tripIdParams },
  )
  .post(
    '/:id/rate',
    ({ user, params, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(
        () => tripService.rateTrip(user, params.id, body.rating, body.comment, body.tags),
        set,
      );
    },
    { params: tripIdParams, body: rateTripBody },
  )
  .put(
    '/:id/collect',
    ({ user, params, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => tripService.collectTrip(user, params.id), set);
    },
    { params: tripIdParams },
  );
