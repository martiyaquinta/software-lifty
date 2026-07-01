import { Elysia } from 'elysia';
import { verifyHmac } from '../../shared/lib/didit';
import { sessionParams } from './schema';
import { kycService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const kycRoutes = new Elysia({ prefix: '/kyc' })
  .get(
    '/session/:driver_id',
    ({ user, params, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => kycService.getSession(user, params.driver_id), set);
    },
    { params: sessionParams },
  )
  .post('/webhook/didit', async ({ request, set }) => {
    const signature = request.headers.get('X-Didit-Signature') || '';
    const text = await request.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      set.status = 400;
      return { error: 'Bad Request', message: 'Invalid JSON body' };
    }

    if (!verifyHmac(text, signature)) {
      set.status = 401;
      return { error: 'Unauthorized', message: 'Invalid HMAC signature' };
    }

    if (!body.driver_id || !body.status) {
      set.status = 400;
      return { error: 'Bad Request', message: 'driver_id and status are required' };
    }

    return safeCall(
      () =>
        kycService
          .processWebhook(body.driver_id, body.status)
          .then(() => ({ message: 'Webhook processed' })),
      set,
    );
  });
