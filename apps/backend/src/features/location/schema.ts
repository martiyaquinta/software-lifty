import { t } from 'elysia';

export const locationUpdateBody = t.Object({
  lat: t.Number(),
  lng: t.Number(),
  heading: t.Optional(t.Number()),
});
