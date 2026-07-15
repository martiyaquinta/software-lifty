import { t } from 'elysia';

export const messageResponse = t.Object({
  message: t.String(),
});

export const meResponse = t.Object({
  id: t.String(),
  phone: t.Union([t.String(), t.Null()]),
  email: t.Union([t.String(), t.Null()]),
  role: t.String(),
  full_name: t.Union([t.String(), t.Null()]),
  avatar_url: t.Union([t.String(), t.Null()]),
  created_at: t.Union([t.String(), t.Null()]),
});
