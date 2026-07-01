import { t } from 'elysia';

export const rateTripBody = t.Object({
  rating: t.Integer({ minimum: 1, maximum: 5 }),
  tags: t.Optional(t.String()),
  comment: t.Optional(t.String()),
});

export const ratingTripParams = t.Object({
  trip_id: t.String(),
});
