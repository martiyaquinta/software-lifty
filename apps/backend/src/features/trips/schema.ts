import { t } from 'elysia';

export const tripIdParams = t.Object({
  id: t.String(),
});

export const createTripBody = t.Object({
  origin_lat: t.Number(),
  origin_lng: t.Number(),
  dest_lat: t.Number(),
  dest_lng: t.Number(),
  origin_address: t.Optional(t.String()),
  dest_address: t.Optional(t.String()),
  distance_km: t.Optional(t.Number()),
  duration_minutes: t.Optional(t.Number()),
  vehicle_type: t.Optional(t.String()),
});

export const rateTripBody = t.Object({
  rating: t.Integer({ minimum: 1, maximum: 5 }),
  comment: t.Optional(t.String()),
  tags: t.Optional(t.String()),
});
