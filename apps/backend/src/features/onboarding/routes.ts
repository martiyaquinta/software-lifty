import { Elysia } from 'elysia';
import { authGuard } from '../../shared/middleware/require-auth';
import { step1Body, step2Body, step3Body, uploadDocBody } from './schema';
import { onboardingService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const onboardingRoutes = new Elysia({ prefix: '/onboarding' })
  .use(authGuard)
  .post(
    '/step1',
    ({ user, body, set }) => safeCall(() => onboardingService.step1(user, body.full_name), set),
    { body: step1Body, requireAuth: true },
  )
  .post(
    '/step2',
    ({ user, body, set }) => safeCall(() => onboardingService.step2(user, body), set),
    {
      body: step2Body,
      requireAuth: true,
    },
  )
  .post(
    '/step3',
    ({ user, body, set }) => safeCall(() => onboardingService.step3(user, body.documents), set),
    { body: step3Body, requireAuth: true },
  )
  .post(
    '/step3/upload',
    ({ user, body, set }) =>
      safeCall(() => onboardingService.uploadDocument(user, body.file, body.doc_type), set),
    { body: uploadDocBody, requireAuth: true },
  )
  .get('/status', ({ user, set }) => safeCall(() => onboardingService.getStatus(user), set), {
    requireAuth: true,
  });
