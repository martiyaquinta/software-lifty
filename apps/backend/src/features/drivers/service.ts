import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { driverDocuments, drivers, users, vehicles } from '../../shared/db/schema';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { uploadFile } from '../../shared/lib/storage';
import type { AuthUser } from '../../shared/middleware/auth';

const VALID_DOC_TYPES = [
  'drivers_license',
  'vehicle_registration',
  'vehicle_insurance',
  'license',
  'registration',
  'insurance',
  'background_check',
];

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

    if (!driver) {
      console.log('[getMyStatus] userId:', user.id, '→ driver row NOT FOUND → returning pending');
      return { status: 'pending' };
    }

    console.log(
      '[getMyStatus] userId:',
      user.id,
      '| status:',
      driver.status,
      '| kyc_status:',
      driver.kyc_status,
    );

    if (driver.status === 'approved' || driver.status === 'suspended') {
      console.log('[getMyStatus] → returning', driver.status);
      return { status: driver.status, step: driver.status };
    }
    if (driver.kyc_status === 'approved') {
      console.log(
        '[getMyStatus] → kyc_status approved but status is',
        driver.status,
        '→ returning approved',
      );
      return { status: 'approved', step: 'approved' };
    }
    if (driver.kyc_status === 'under_review' || driver.kyc_status === 'in_progress') {
      console.log('[getMyStatus] → returning under_review');
      return { status: 'under_review' };
    }
    if (driver.kyc_status === 'rejected') {
      console.log('[getMyStatus] → returning rejected');
      return { status: 'rejected' };
    }
    console.log('[getMyStatus] → FALLTHROUGH returning pending, step:', driver.status);
    return { status: 'pending', step: driver.status };
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

  async updateProfile(
    user: AuthUser,
    data: {
      first_name?: string;
      last_name?: string;
      vehicle_plate?: string;
      vehicle_brand?: string;
      vehicle_model?: string;
      vehicle_color?: string;
      vehicle_year?: number;
      vehicle_type?: string;
      photo_url?: string;
    },
  ) {
    const [existing] = await db
      .select({ id: drivers.id, status: drivers.status })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    let driverId: string;
    let currentStatus = existing?.status ?? 'step1';

    if (existing) {
      driverId = existing.id;
    } else {
      const [newDriver] = await db
        .insert(drivers)
        .values({ user_id: user.id, status: 'step2' })
        .returning({ id: drivers.id });

      if (!newDriver) throw new AppError('Failed to create driver profile', 500, 'INTERNAL_ERROR');
      driverId = newDriver.id;
      currentStatus = 'step2';
    }

    if (data.first_name || data.last_name) {
      const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ');
      await db
        .update(users)
        .set({ full_name: fullName, updated_at: new Date() })
        .where(eq(users.id, user.id));
    }

    if (data.photo_url) {
      await db
        .update(users)
        .set({ avatar_url: data.photo_url, updated_at: new Date() })
        .where(eq(users.id, user.id));
    }

    if (currentStatus === 'step1' || currentStatus === 'step2') {
      await db
        .update(drivers)
        .set({ status: 'step2', updated_at: new Date() })
        .where(eq(drivers.id, driverId));
      currentStatus = 'step2';
    }

    const hasVehicleData =
      data.vehicle_brand ||
      data.vehicle_model ||
      data.vehicle_color ||
      data.vehicle_plate ||
      data.vehicle_year;

    if (hasVehicleData) {
      const [existingVehicle] = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(eq(vehicles.driver_id, driverId))
        .limit(1);

      const vehicleValues = {
        driver_id: driverId,
        brand: data.vehicle_brand ?? '',
        model: data.vehicle_model ?? '',
        year: data.vehicle_year ?? new Date().getFullYear(),
        color: data.vehicle_color ?? '',
        plate: data.vehicle_plate ?? '',
        vehicle_type: data.vehicle_type ?? 'car',
      };

      if (existingVehicle) {
        await db.update(vehicles).set(vehicleValues).where(eq(vehicles.id, existingVehicle.id));
      } else {
        await db.insert(vehicles).values(vehicleValues);
      }
    }

    if (hasVehicleData && (currentStatus === 'step2' || currentStatus === 'step3')) {
      await db
        .update(drivers)
        .set({ status: 'step3', updated_at: new Date() })
        .where(eq(drivers.id, driverId));
      currentStatus = 'step3';
    }

    return { id: driverId, status: currentStatus, message: 'Profile updated' };
  },

  async addDocument(
    user: AuthUser,
    data: { doc_type: string; file_url: string; file_name?: string },
  ) {
    if (!VALID_DOC_TYPES.includes(data.doc_type)) {
      throw new AppError(`Invalid doc_type: ${data.doc_type}`, 400, 'BAD_REQUEST');
    }

    const [driver] = await db
      .select({ id: drivers.id, status: drivers.status })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver profile not found. Complete step 1 first');

    await db.insert(driverDocuments).values({
      driver_id: driver.id,
      doc_type: data.doc_type,
      file_url: data.file_url,
    });

    const docsList = await db
      .select({ id: driverDocuments.id })
      .from(driverDocuments)
      .where(eq(driverDocuments.driver_id, driver.id));

    if (docsList.length >= 3 && driver.status === 'step3') {
      await db
        .update(drivers)
        .set({ status: 'kyc', kyc_status: 'in_progress', updated_at: new Date() })
        .where(eq(drivers.id, driver.id));
    }

    return { message: 'Document uploaded', status: driver.status };
  },

  async uploadPhoto(user: AuthUser, file: File) {
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    const path = `avatars/${driver?.id ?? user.id}-${Date.now()}`;
    const fileUrl = await uploadFile(file, path);

    await db
      .update(users)
      .set({ avatar_url: fileUrl, updated_at: new Date() })
      .where(eq(users.id, user.id));

    return { file_url: fileUrl };
  },

  async listDocuments(user: AuthUser) {
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) return [];

    return db
      .select({
        id: driverDocuments.id,
        doc_type: driverDocuments.doc_type,
        file_url: driverDocuments.file_url,
        verified_at: driverDocuments.verified_at,
        expires_at: driverDocuments.expires_at,
        created_at: driverDocuments.created_at,
      })
      .from(driverDocuments)
      .where(eq(driverDocuments.driver_id, driver.id))
      .orderBy(driverDocuments.created_at);
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
