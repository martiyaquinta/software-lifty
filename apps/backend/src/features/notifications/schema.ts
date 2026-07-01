import { t } from 'elysia';

export const registerTokenBody = t.Object({
  token: t.String({ minLength: 1, maxLength: 512 }),
  platform: t.Optional(t.String({ maxLength: 20 })),
});
