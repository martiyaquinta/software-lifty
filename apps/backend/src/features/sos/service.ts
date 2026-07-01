import { and, eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { getDriverId } from '../../shared/db/queries';
import { drivers, sosEvents, trips } from '../../shared/db/schema';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import type { AuthUser } from '../../shared/middleware/auth';

async function verifyTrip(tripId: string, driverId: string): Promise<void> {
  const [trip] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.driver_id, driverId)))
    .limit(1);
  if (!trip) throw new NotFoundError('Trip not found');
}

export const sosService = {
  async createSos(
    user: AuthUser,
    body: {
      type: string;
      description?: string;
      lat?: number;
      lng?: number;
      trip_id?: string;
    },
  ) {
    const validTypes = ['911', 'police', 'share_location', 'report_lifty'];
    if (!validTypes.includes(body.type)) {
      throw new AppError(`Invalid type: ${body.type}`, 400, 'BAD_REQUEST');
    }

    const driverId = await getDriverId(user);

    if (body.trip_id) {
      await verifyTrip(body.trip_id, driverId);
    }

    const [sos] = await db
      .insert(sosEvents)
      .values({
        user_id: user.id,
        type: body.type,
        description: body.description ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        trip_id: body.trip_id ?? null,
      })
      .returning({ id: sosEvents.id });

    return { sos_id: sos.id, message: 'Emergency reported' };
  },

  async createAccident(
    user: AuthUser,
    body: {
      accident_type: string;
      description?: string;
      lat?: number;
      lng?: number;
      trip_id?: string;
    },
  ) {
    const validTypes = ['collision', 'passenger', 'mechanical', 'other'];
    if (!validTypes.includes(body.accident_type)) {
      throw new AppError(`Invalid accident_type: ${body.accident_type}`, 400, 'BAD_REQUEST');
    }

    const driverId = await getDriverId(user);

    if (body.trip_id) {
      await verifyTrip(body.trip_id, driverId);
    }

    const [sos] = await db
      .insert(sosEvents)
      .values({
        user_id: user.id,
        type: 'accident',
        accident_type: body.accident_type,
        description: body.description ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        trip_id: body.trip_id ?? null,
      })
      .returning({ id: sosEvents.id });

    return { sos_id: sos.id, message: 'Accident reported' };
  },
};
