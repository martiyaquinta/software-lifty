import { t } from 'elysia';

export const webhookBody = t.Object({
  payment_id: t.String(),
  trip_id: t.String(),
  status: t.Optional(t.String()),
});

export const withdrawBody = t.Object({
  amount: t.Number({ minimum: 1 }),
  payout_method_id: t.String(),
});
