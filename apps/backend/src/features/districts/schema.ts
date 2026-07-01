import { t } from 'elysia';

export const districtsListResponse = t.Object({
  districts: t.Array(
    t.Object({
      id: t.String(),
      name: t.String(),
      province: t.String(),
      status: t.String(),
    }),
  ),
});
