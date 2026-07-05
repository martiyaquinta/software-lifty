import { Elysia } from 'elysia';
import { verifyHmac } from '../../shared/lib/didit';
import { sessionParams } from './schema';
import { kycService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

function extractWebhookData(body: any): {
  userId: string;
  status: string;
  documentNumber?: string;
  fullName?: string;
} {
  const userId = body.vendor_data || body.user_id || body.driver_id;
  const status = body.status;
  const documentNumber =
    body.document_number ||
    body.documentNumber ||
    body.result?.document_number ||
    body.result?.documentNumber;
  const fullName =
    body.full_name || body.fullName || body.result?.full_name || body.result?.fullName;

  return { userId, status, documentNumber, fullName };
}

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

    const { userId, status, documentNumber, fullName } = extractWebhookData(body);

    if (!userId || !status) {
      set.status = 400;
      return { error: 'Bad Request', message: 'userId and status are required' };
    }

    return safeCall(
      () =>
        kycService
          .processWebhook(userId, status, { documentNumber, fullName })
          .then(() => ({ message: 'Webhook processed' })),
      set,
    );
  });
