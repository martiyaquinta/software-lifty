import { Elysia } from 'elysia';
import { authGuard } from '../../shared/middleware/require-auth';
import { historyQuery } from './schema';
import { earningsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const earningsRoutes = new Elysia({ prefix: '/earnings' })
  .use(authGuard)
  .get('/summary', ({ user, set }) => safeCall(() => earningsService.getSummary(user), set), {
    requireAuth: true,
  })
  .get(
    '/history',
    ({ user, query, set }) =>
      safeCall(
        () =>
          earningsService.getHistory(
            user,
            Number(query.page) || 1,
            Number(query.limit) || 20,
            query.from as string | undefined,
            query.to as string | undefined,
          ),
        set,
      ),
    { query: historyQuery, requireAuth: true },
  );

export const driverStatsRoutes = new Elysia({ prefix: '/drivers' })
  .use(authGuard)
  .get('/me/stats', ({ user, set }) => safeCall(() => earningsService.getStats(user), set), {
    requireAuth: true,
  })
  .get(
    '/me/earnings/daily',
    ({ user, set }) => safeCall(() => earningsService.getDaily(user), set),
    {
      requireAuth: true,
    },
  );
