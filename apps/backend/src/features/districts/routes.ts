import { Elysia } from 'elysia';
import { districtsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const districtsRoutes = new Elysia({ prefix: '/districts' }).get('/', ({ user, set }) => {
  if (!user) {
    set.status = 401;
    return { error: 'Unauthorized' };
  }
  return safeCall(() => districtsService.getActive(), set);
});
