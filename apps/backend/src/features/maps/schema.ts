import { t } from 'elysia';

export const autocompleteQuery = t.Object({
  input: t.String({ minLength: 1 }),
});

export const geocodeQuery = t.Object({
  lat: t.Optional(t.Number()),
  lng: t.Optional(t.Number()),
  address: t.Optional(t.String()),
});

export const directionsQuery = t.Object({
  origin_lat: t.Number(),
  origin_lng: t.Number(),
  dest_lat: t.Number(),
  dest_lng: t.Number(),
});

export const fareEstimateBody = t.Object({
  origin_lat: t.Number(),
  origin_lng: t.Number(),
  dest_lat: t.Number(),
  dest_lng: t.Number(),
  vehicle_type: t.String(),
});
