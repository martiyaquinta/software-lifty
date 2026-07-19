import { Elysia } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import type { AuthUser } from '../../shared/middleware/auth';
import { authGuard } from '../../shared/middleware/require-auth';
import { approveDriver } from './approve';
import { driverIdParams, reviewBody } from './schema';
import { adminService } from './service';

export const adminApproveRoute = new Elysia().get('/admin/approve', ({ query, set }) => {
  const token = (query as any)?.token;
  if (!token) {
    set.status = 400;
    return { error: { code: 'BAD_REQUEST', message: 'Token is required', status: 400 } };
  }
  return safeCall(() => approveDriver(String(token)), set);
});

function isAdmin(user: AuthUser, set: { status: number }): boolean {
  if (user.role !== 'admin') {
    set.status = 403;
    return false;
  }
  return true;
}

export const adminRoutes = new Elysia({ prefix: '/admin' })
  .use(authGuard)
  .get(
    '/drivers/pending',
    ({ user, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.listPending(), set);
    },
    { requireAuth: true },
  )
  .get(
    '/drivers/:driver_id',
    ({ user, params, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(() => adminService.getDriverDetail(params.driver_id), set);
    },
    { params: driverIdParams, requireAuth: true },
  )
  .post(
    '/drivers/:driver_id/review',
    ({ user, params, body, set }) => {
      if (!isAdmin(user, set)) return { error: 'Forbidden' };
      return safeCall(
        () => adminService.reviewDriver(user, params.driver_id, body.action, body.notes),
        set,
      );
    },
    { params: driverIdParams, body: reviewBody, requireAuth: true },
  );
