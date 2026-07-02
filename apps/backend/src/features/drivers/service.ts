import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { drivers, users, vehicles } from '../../shared/db/schema';
import { NotFoundError } from '../../shared/lib/errors';
import type { AuthUser } from '../../shared/middleware/auth';

export const driversService = {
  async getPublicProfile(driverId: string) {
    const rows = await db
      .select({
        id: drivers.id,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
        rating_avg: drivers.rating_avg,
        total_trips: drivers.total_trips,
        kyc_status: drivers.kyc_status,
        brand: vehicles.brand,
        model: vehicles.model,
        year: vehicles.year,
        color: vehicles.color,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(vehicles, eq(drivers.id, vehicles.driver_id))
      .where(eq(drivers.id, driverId))
      .limit(1);

    const row = rows[0];
    if (!row) throw new NotFoundError('Driver not found');

    return {
      id: row.id,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      rating_avg: row.rating_avg,
      total_trips: row.total_trips,
      kyc_verified: row.kyc_status === 'approved',
      vehicle: {
        brand: row.brand,
        model: row.model,
        year: row.year,
        color: row.color,
      },
    };
  },

  async getMyStatus(user: AuthUser) {
    const [driver] = await db
      .select({ status: drivers.status, kyc_status: drivers.kyc_status })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    // Map the internal onboarding lifecycle (step1..step3/kyc) to the
    // coarse status vocabulary the app navigates with.
    if (!driver) return { status: 'pending' };
    if (driver.status === 'approved' || driver.status === 'suspended') {
      return { status: driver.status };
    }
    if (driver.kyc_status === 'under_review') return { status: 'under_review' };
    if (driver.kyc_status === 'rejected') return { status: 'rejected' };
    return { status: 'pending' };
  },

  async toggleOnline(user: AuthUser, isOnline: boolean) {
    const [driver] = await db
      .select({ id: drivers.id, is_online: drivers.is_online })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) throw new NotFoundError('Onboarding not started');

    await db
      .update(drivers)
      .set({ is_online: isOnline, updated_at: new Date() })
      .where(eq(drivers.id, driver.id));

    return {
      is_online: isOnline,
      message: isOnline ? 'Driver is now online' : 'Driver is now offline',
    };
  },

  async getMyProfile(user: AuthUser) {
    const rows = await db
      .select({
        phone: users.phone,
        email: users.email,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
        id: drivers.id,
        user_id: drivers.user_id,
        status: drivers.status,
        kyc_status: drivers.kyc_status,
        rating_avg: drivers.rating_avg,
        total_trips: drivers.total_trips,
        completion_rate: drivers.completion_rate,
        is_online: drivers.is_online,
        created_at: drivers.created_at,
        brand: vehicles.brand,
        model: vehicles.model,
        year: vehicles.year,
        color: vehicles.color,
        plate: vehicles.plate,
        vehicle_type: vehicles.vehicle_type,
      })
      .from(users)
      .leftJoin(drivers, eq(users.id, drivers.user_id))
      .leftJoin(vehicles, eq(drivers.id, vehicles.driver_id))
      .where(eq(users.id, user.id))
      .limit(1);

    const row = rows[0];

    if (!row || !row.id) {
      return { step: 'step1', message: 'Onboarding not started' };
    }

    return {
      id: row.id,
      user_id: row.user_id,
      phone: row.phone,
      email: row.email,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      status: row.status,
      kyc_status: row.kyc_status,
      rating_avg: row.rating_avg,
      total_trips: row.total_trips,
      completion_rate: row.completion_rate,
      is_online: row.is_online,
      vehicle: {
        brand: row.brand,
        model: row.model,
        year: row.year,
        color: row.color,
        plate: row.plate,
        vehicle_type: row.vehicle_type,
      },
      created_at: row.created_at ? row.created_at.toISOString() : null,
    };
  },
};
