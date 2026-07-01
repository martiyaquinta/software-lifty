import { Elysia } from 'elysia';
import { autocompleteQuery, directionsQuery, fareEstimateBody, geocodeQuery } from './schema';
import { mapsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const mapsRoutes = new Elysia({ prefix: '/maps' })
  .get(
    '/places/autocomplete',
    ({ user, query, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => mapsService.autocomplete(query.input), set);
    },
    { query: autocompleteQuery },
  )
  .get(
    '/geocode',
    ({ user, query, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(
        () => mapsService.geocode({ lat: query.lat, lng: query.lng, address: query.address }),
        set,
      );
    },
    { query: geocodeQuery },
  )
  .get(
    '/directions',
    ({ user, query, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(
        () =>
          mapsService.directions(
            query.origin_lat,
            query.origin_lng,
            query.dest_lat,
            query.dest_lng,
          ),
        set,
      );
    },
    { query: directionsQuery },
  )
  .post(
    '/fare-estimate',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(
        () =>
          mapsService.fareEstimate(
            body.origin_lat,
            body.origin_lng,
            body.dest_lat,
            body.dest_lng,
            body.vehicle_type,
          ),
        set,
      );
    },
    { body: fareEstimateBody },
  );
