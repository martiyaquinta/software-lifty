import { Elysia } from 'elysia';
import { authGuard } from '../../shared/middleware/require-auth';
import {
  districtDetailResponse,
  districtParams,
  districtsListResponse,
  provinceQuery,
  provincesResponse,
} from './schema';
import { districtsService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const districtsRoutes = new Elysia({ prefix: '/districts' })
  .use(authGuard)
  .get('/', ({ query, set }) => safeCall(() => districtsService.getActive(query.province), set), {
    query: provinceQuery,
    requireAuth: true,
  })
  .get('/provinces', ({ set }) => safeCall(() => districtsService.getProvinces(), set), {
    requireAuth: true,
    response: provincesResponse,
  })
  .get('/:id', ({ params, set }) => safeCall(() => districtsService.getById(params.id), set), {
    params: districtParams,
    requireAuth: true,
    response: districtDetailResponse,
  });
