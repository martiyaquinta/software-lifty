import { Elysia } from 'elysia';
import { logger } from '../../shared/lib/logger';
import { safeCall } from '../../shared/lib/route-utils';
import { authGuard } from '../../shared/middleware/require-auth';
import {
  emailOnlyBody,
  loginBody,
  refreshBody,
  registerBody,
  resetPasswordBody,
  verifyEmailBody,
} from './schema';
import { authService } from './service';

export const authRoutes = new Elysia({ prefix: '/auth' })
  .use(authGuard)
  .post(
    '/register',
    ({ body, set }) => {
      logger.info('[AUTH:ROUTE] POST /auth/register', { email: body.email });
      return safeCall(() => authService.register(body.email, body.password), set);
    },
    {
      body: registerBody,
    },
  )
  .post(
    '/verify',
    ({ body, set }) => {
      logger.info('[AUTH:ROUTE] POST /auth/verify', { email: body.email });
      return safeCall(() => authService.verifyEmail(body.email, body.code), set);
    },
    {
      body: verifyEmailBody,
    },
  )
  .post(
    '/resend-code',
    ({ body, set }) => {
      logger.info('[AUTH:ROUTE] POST /auth/resend-code', { email: body.email });
      return safeCall(() => authService.resendCode(body.email), set);
    },
    {
      body: emailOnlyBody,
    },
  )
  .post(
    '/forgot-password',
    ({ body, set }) => {
      logger.info('[AUTH:ROUTE] POST /auth/forgot-password', { email: body.email });
      return safeCall(() => authService.forgotPassword(body.email), set);
    },
    {
      body: emailOnlyBody,
    },
  )
  .post(
    '/reset-password',
    ({ body, set }) => {
      logger.info('[AUTH:ROUTE] POST /auth/reset-password', { email: body.email });
      return safeCall(() => authService.resetPassword(body.email, body.code, body.password), set);
    },
    {
      body: resetPasswordBody,
    },
  )
  .post(
    '/login',
    ({ body, set }) => {
      logger.info('[AUTH:ROUTE] POST /auth/login', { email: body.email });
      return safeCall(() => authService.login(body.email, body.password), set);
    },
    {
      body: loginBody,
    },
  )
  .post(
    '/refresh',
    ({ body, set }) => {
      logger.info('[AUTH:ROUTE] POST /auth/refresh');
      return safeCall(() => authService.refreshToken(body.refresh_token), set);
    },
    {
      body: refreshBody,
    },
  )
  .get('/me', ({ user, set }) => safeCall(() => authService.getMe(user), set), {
    requireAuth: true,
  })
  .post('/logout', ({ user, set }) => safeCall(() => authService.logout(user), set), {
    requireAuth: true,
  });
