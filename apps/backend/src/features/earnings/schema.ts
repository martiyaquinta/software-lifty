import { t } from 'elysia';

export const historyQuery = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
});
