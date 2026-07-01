import { t } from 'elysia';

export const driverIdParams = t.Object({
  id: t.String({ minLength: 1 }),
});

export const toggleOnlineBody = t.Object({
  is_online: t.Boolean(),
});
