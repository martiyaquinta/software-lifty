import { t } from 'elysia';

export const registerBody = t.Object({
  email: t.String({ format: 'email' }),
  password: t.String({ minLength: 6 }),
});

export const verifyEmailBody = t.Object({
  email: t.String({ format: 'email' }),
  code: t.String({ minLength: 6, maxLength: 6 }),
});

export const loginBody = t.Object({
  email: t.String({ format: 'email' }),
  password: t.String(),
});

export const refreshBody = t.Object({
  refresh_token: t.String(),
});

export const emailOnlyBody = t.Object({
  email: t.String({ format: 'email' }),
});

export const resetPasswordBody = t.Object({
  email: t.String({ format: 'email' }),
  code: t.String({ minLength: 6, maxLength: 6 }),
  password: t.String({ minLength: 6 }),
});

export const messageResponse = t.Object({
  message: t.String(),
});

export const registerResponse = t.Object({
  id: t.String(),
  email: t.String(),
  message: t.String(),
});

export const verifyResponse = t.Object({
  message: t.String(),
  alreadyVerified: t.Optional(t.Boolean()),
});

export const loginResponse = t.Object({
  access_token: t.String(),
  refresh_token: t.String(),
  user: t.Object({
    id: t.String(),
    email: t.String(),
    role: t.String(),
  }),
});

export const refreshResponse = t.Object({
  access_token: t.String(),
  refresh_token: t.String(),
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
