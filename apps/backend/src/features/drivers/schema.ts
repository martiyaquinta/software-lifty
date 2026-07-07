import { t } from 'elysia';

export const driverIdParams = t.Object({
  id: t.String({ minLength: 1 }),
});

export const toggleOnlineBody = t.Object({
  is_online: t.Boolean(),
});

export const updateProfileBody = t.Object({
  first_name: t.Optional(t.String()),
  last_name: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  vehicle_plate: t.Optional(t.String()),
  vehicle_brand: t.Optional(t.String()),
  vehicle_model: t.Optional(t.String()),
  vehicle_color: t.Optional(t.String()),
  vehicle_year: t.Optional(t.Number()),
  vehicle_type: t.Optional(t.String()),
  photo_url: t.Optional(t.Union([t.String(), t.Null()])),
});

export const addDocumentBody = t.Object({
  doc_type: t.String(),
  file_url: t.String(),
  file_name: t.Optional(t.String()),
});

export const uploadPhotoBody = t.Object({
  file: t.File({ maxSize: 10 * 1024 * 1024 }),
});
