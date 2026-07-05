import { Elysia } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import { driverIdParams, reviewBody } from './schema';
import { adminService } from './service';

function requireAdmin(user: any, set: { status: number }): boolean {
  if (!user) {
    set.status = 401;
    return false;
  }
  if (user.role !== 'admin') {
    set.status = 403;
    return false;
  }
  return true;
}

export const adminRoutes = new Elysia({ prefix: '/admin' })
  .get('/drivers/pending', ({ user, set }) => {
    if (!requireAdmin(user, set)) {
      return { error: user ? 'Forbidden' : 'Unauthorized' };
    }
    return safeCall(() => adminService.listPending(), set);
  })
  .get(
    '/drivers/:driver_id',
    ({ user, params, set }) => {
      if (!requireAdmin(user, set)) {
        return { error: user ? 'Forbidden' : 'Unauthorized' };
      }
      return safeCall(() => adminService.getDriverDetail(params.driver_id), set);
    },
    { params: driverIdParams },
  )
  .post(
    '/drivers/:driver_id/review',
    ({ user, params, body, set }) => {
      if (!requireAdmin(user, set)) {
        return { error: user ? 'Forbidden' : 'Unauthorized' };
      }
      return safeCall(
        () => adminService.reviewDriver(user, params.driver_id, body.action, body.notes),
        set,
      );
    },
    { params: driverIdParams, body: reviewBody },
  );
