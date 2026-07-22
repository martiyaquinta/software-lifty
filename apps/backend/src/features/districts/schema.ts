import { t } from 'elysia';

export const provinceQuery = t.Object({
  province: t.Optional(t.String()),
});

export const districtParams = t.Object({
  id: t.String(),
});

export const provincesResponse = t.Object({
  provinces: t.Array(t.String()),
});

export const districtItem = t.Object({
  id: t.String(),
  name: t.String(),
  province: t.String(),
});

export const districtsListResponse = t.Object({
  districts: t.Array(districtItem),
});

export const districtDetailResponse = t.Object({
  id: t.String(),
  name: t.String(),
  province: t.String(),
  status: t.String(),
  terms_and_conditions: t.Nullable(t.String()),
  privacy_policy: t.Nullable(t.String()),
});
