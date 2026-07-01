import { t } from 'elysia';

export const addPaymentMethodBody = t.Object({
  method_type: t.String({ minLength: 2, maxLength: 20 }),
  account_number: t.String({ minLength: 1, maxLength: 50 }),
  titular_name: t.Optional(t.String({ minLength: 2, maxLength: 255 })),
  wallet: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});
