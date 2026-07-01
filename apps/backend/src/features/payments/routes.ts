import { Elysia } from 'elysia';
import { verifyWebhookSignature } from '../../shared/lib/mercado-pago';
import { withdrawBody } from './schema';
import { paymentsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const paymentsRoutes = new Elysia({ prefix: '/payments' })
  .post('/webhook/mercadopago', async ({ request, set }) => {
    const rawBody = await request.text();
    const signature = request.headers.get('X-MP-Signature') || '';

    if (!verifyWebhookSignature(rawBody, signature)) {
      set.status = 401;
      return { error: 'Invalid signature' };
    }

    return safeCall(async () => {
      const body = JSON.parse(rawBody);
      return await paymentsService.processWebhook(body);
    }, set);
  })
  .get('/history', ({ user, query, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return safeCall(
      () =>
        paymentsService.getPaymentHistory(user, Number(query.page) || 1, Number(query.limit) || 20),
      set,
    );
  })
  .post(
    '/withdraw',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(
        () => paymentsService.withdraw(user, body.amount, body.payout_method_id),
        set,
      );
    },
    { body: withdrawBody },
  )
  .get('/withdrawals', ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return safeCall(() => paymentsService.getWithdrawals(user), set);
  });
