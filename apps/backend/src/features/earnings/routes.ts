import { Elysia } from 'elysia';
import { historyQuery } from './schema';
import { earningsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const earningsRoutes = new Elysia({ prefix: '/earnings' })
  .get('/summary', ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return safeCall(() => earningsService.getSummary(user), set);
  })
  .get(
    '/history',
    ({ user, query, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(
        () =>
          earningsService.getHistory(
            user,
            Number(query.page) || 1,
            Number(query.limit) || 20,
            query.from as string | undefined,
            query.to as string | undefined,
          ),
        set,
      );
    },
    { query: historyQuery },
  );

export const driverStatsRoutes = new Elysia({ prefix: '/drivers' }).get(
  '/me/stats',
  ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return safeCall(() => earningsService.getStats(user), set);
  },
);
