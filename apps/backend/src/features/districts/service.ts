import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { districts } from '../../shared/db/schema';

export const districtsService = {
  async getActive() {
    const rows = await db
      .select({
        id: districts.id,
        name: districts.name,
        province: districts.province,
      })
      .from(districts)
      .where(eq(districts.status, 'active'))
      .orderBy(districts.name);

    return { districts: rows };
  },
};
