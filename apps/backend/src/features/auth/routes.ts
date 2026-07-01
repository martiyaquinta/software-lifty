import { Elysia } from 'elysia';
import { logger } from '../../shared/lib/logger';
import { safeCall } from '../../shared/lib/route-utils';
import { loginBody, refreshBody, registerBody, verifyEmailBody } from './schema';
import { authService } from './service';

export const authRoutes = new Elysia({ prefix: '/auth' })
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
  .get('/me', ({ user, authStatus, set }) => {
    if (!user) {
      set.status = 401;
      if (authStatus === 'token_expired') {
        return {
          error: 'Unauthorized',
          code: 'TOKEN_EXPIRED',
          message: 'Token expired, please refresh',
        };
      }
      return { error: 'Unauthorized', code: 'TOKEN_REQUIRED' };
    }
    return safeCall(() => authService.getMe(user), set);
  })
  .post('/logout', ({ user, authStatus, set }) => {
    if (!user) {
      set.status = 401;
      if (authStatus === 'token_expired') {
        return {
          error: 'Unauthorized',
          code: 'TOKEN_EXPIRED',
          message: 'Token expired, please refresh',
        };
      }
      return { error: 'Unauthorized', code: 'TOKEN_REQUIRED' };
    }
    return safeCall(() => authService.logout(user), set);
  });
