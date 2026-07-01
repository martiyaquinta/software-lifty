import { t } from 'elysia';

export const createSosBody = t.Object({
  type: t.String(),
  description: t.Optional(t.String()),
  lat: t.Optional(t.Number()),
  lng: t.Optional(t.Number()),
  trip_id: t.Optional(t.String()),
});

export const createAccidentBody = t.Object({
  accident_type: t.String(),
  description: t.Optional(t.String()),
  lat: t.Optional(t.Number()),
  lng: t.Optional(t.Number()),
  trip_id: t.Optional(t.String()),
});
