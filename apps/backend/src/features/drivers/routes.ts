import { Elysia } from 'elysia';
import { authGuard } from '../../shared/middleware/require-auth';
import {
  addDocumentBody,
  driverIdParams,
  reuploadDocBody,
  toggleOnlineBody,
  updateProfileBody,
  uploadPhotoBody,
} from './schema';
import { driversService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const driversRoutes = new Elysia({ prefix: '/drivers' })
  .use(authGuard)
  .get(
    '/:id/profile',
    ({ params: { id }, set }) => {
      return safeCall(() => driversService.getPublicProfile(id), set);
    },
    { params: driverIdParams },
  )
  .get('/me', ({ user, set }) => safeCall(() => driversService.getMyProfile(user), set), {
    requireAuth: true,
  })
  .get('/me/status', ({ user, set }) => safeCall(() => driversService.getMyStatus(user), set), {
    requireAuth: true,
  })
  .put(
    '/me/online',
    ({ user, body, set }) => safeCall(() => driversService.toggleOnline(user, body.is_online), set),
    { body: toggleOnlineBody, requireAuth: true },
  )
  .put(
    '/me',
    ({ user, body, set }) => safeCall(() => driversService.updateProfile(user, body), set),
    { body: updateProfileBody, requireAuth: true },
  )
  .post(
    '/me/documents',
    ({ user, body, set }) => safeCall(() => driversService.addDocument(user, body), set),
    { body: addDocumentBody, requireAuth: true },
  )
  .get(
    '/me/documents',
    ({ user, set }) => safeCall(() => driversService.listDocuments(user), set),
    {
      requireAuth: true,
    },
  )
  .post(
    '/me/documents/reupload',
    ({ user, body, set }) =>
      safeCall(() => driversService.reuploadDocument(user, body.file, body.doc_type), set),
    { body: reuploadDocBody, requireAuth: true },
  )
  .post(
    '/me/photo',
    ({ user, body, set }) => safeCall(() => driversService.uploadPhoto(user, body.file), set),
    { body: uploadPhotoBody, requireAuth: true },
  );
