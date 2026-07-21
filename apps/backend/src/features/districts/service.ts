import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { districts } from '../../shared/db/schema';
import { NotFoundError } from '../../shared/lib/errors';

type DistrictRow = {
  id: string;
  name: string;
  province: string;
  status: string;
  terms_and_conditions: string | null;
  privacy_policy: string | null;
};

function filterSelectable(rows: DistrictRow[]) {
  return rows
    .filter((r) => r.terms_and_conditions !== null)
    .map(({ terms_and_conditions: _, privacy_policy: _p, ...rest }) => rest);
}

export const districtsService = {
  async getActive(province?: string) {
    const conditions = [eq(districts.status, 'active'), isNotNull(districts.terms_and_conditions)];
    if (province) conditions.push(eq(districts.province, province));

    const rows = await db
      .select({
        id: districts.id,
        name: districts.name,
        province: districts.province,
        status: districts.status,
        terms_and_conditions: districts.terms_and_conditions,
        privacy_policy: districts.privacy_policy,
      })
      .from(districts)
      .where(and(...conditions))
      .orderBy(districts.name);

    return { districts: filterSelectable(rows) };
  },

  async getProvinces() {
    const rows = await db
      .select({ province: districts.province })
      .from(districts)
      .where(and(eq(districts.status, 'active'), isNotNull(districts.terms_and_conditions)))
      .orderBy(districts.province);

    const seen = new Set<string>();
    const provinces: string[] = [];
    for (const r of rows) {
      if (!seen.has(r.province)) {
        seen.add(r.province);
        provinces.push(r.province);
      }
    }
    return { provinces };
  },

  async getById(id: string) {
    const rows = await db
      .select({
        id: districts.id,
        name: districts.name,
        province: districts.province,
        status: districts.status,
        terms_and_conditions: districts.terms_and_conditions,
        privacy_policy: districts.privacy_policy,
      })
      .from(districts)
      .where(eq(districts.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) throw new NotFoundError('District not found');
    return row;
  },
};
