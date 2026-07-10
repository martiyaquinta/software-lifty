import { Elysia } from 'elysia';
import { authGuard } from '../../shared/middleware/require-auth';
import { addPaymentMethodBody } from './schema';
import { paymentMethodsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const paymentMethodsRoutes = new Elysia({ prefix: '/drivers/me/payment-methods' })
  .use(authGuard)
  .post(
    '/',
    ({ user, body, set }) =>
      safeCall(
        () =>
          paymentMethodsService.addMethod(
            user,
            body.method_type,
            body.account_number,
            body.titular_name,
            body.wallet,
          ),
        set,
      ),
    { body: addPaymentMethodBody, requireAuth: true },
  )
  .get('/', ({ user, set }) => safeCall(() => paymentMethodsService.getMethods(user), set), {
    requireAuth: true,
  })
  .delete(
    '/:id',
    ({ user, params, set }) =>
      safeCall(() => paymentMethodsService.deleteMethod(user, params.id), set),
    { requireAuth: true },
  );
