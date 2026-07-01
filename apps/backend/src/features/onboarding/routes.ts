import { Elysia } from 'elysia';
import { step1Body, step2Body, step3Body, uploadDocBody } from './schema';
import { onboardingService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const onboardingRoutes = new Elysia({ prefix: '/onboarding' })
  .post(
    '/step1',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => onboardingService.step1(user, body.full_name), set);
    },
    { body: step1Body },
  )
  .post(
    '/step2',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => onboardingService.step2(user, body), set);
    },
    { body: step2Body },
  )
  .post(
    '/step3',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => onboardingService.step3(user, body.documents), set);
    },
    { body: step3Body },
  )
  .post(
    '/step3/upload',
    ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
      return safeCall(() => onboardingService.uploadDocument(user, body.file, body.doc_type), set);
    },
    { body: uploadDocBody },
  )
  .get('/status', ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return safeCall(() => onboardingService.getStatus(user), set);
  });
