import { Elysia } from 'elysia';
import { addPaymentMethodBody } from './schema';
import { paymentMethodsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const paymentMethodsRoutes = new Elysia({ prefix: '/drivers/me/payment-methods' })
  .post(
    '/',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(
        () =>
          paymentMethodsService.addMethod(
            user,
            body.method_type,
            body.account_number,
            body.titular_name,
            body.wallet,
          ),
        set,
      );
    },
    { body: addPaymentMethodBody },
  )
  .get('/', ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return safeCall(() => paymentMethodsService.getMethods(user), set);
  })
  .delete('/:id', ({ user, params, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return safeCall(() => paymentMethodsService.deleteMethod(user, params.id), set);
  });
