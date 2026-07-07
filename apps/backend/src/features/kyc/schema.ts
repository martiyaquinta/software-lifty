import { t } from 'elysia';

export const sessionParams = t.Object({
  driver_id: t.String(),
});

export const decisionParams = t.Object({
  session_id: t.String(),
});
