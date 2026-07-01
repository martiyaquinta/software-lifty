import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { driverLocations, drivers } from '../../shared/db/schema';

export async function getDriverIdByUserId(userId: string): Promise<string> {
  const [driver] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.user_id, userId))
    .limit(1);

  if (!driver) throw new Error('Driver profile not found');
  return driver.id;
}

export async function upsertLocation(driverId: string, lat: number, lng: number, heading?: number) {
  await db
    .insert(driverLocations)
    .values({
      driver_id: driverId,
      lat,
      lng,
      heading: heading ?? null,
    })
    .onConflictDoUpdate({
      target: driverLocations.driver_id,
      set: {
        lat,
        lng,
        heading: heading ?? null,
        updated_at: new Date(),
      },
    });
}
