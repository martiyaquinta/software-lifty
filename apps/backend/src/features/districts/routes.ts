import { Elysia } from 'elysia';
import { authGuard } from '../../shared/middleware/require-auth';
import { districtsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const districtsRoutes = new Elysia({ prefix: '/districts' })
  .use(authGuard)
  .get('/', ({ set }) => safeCall(() => districtsService.getActive(), set), { requireAuth: true });
