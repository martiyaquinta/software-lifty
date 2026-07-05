import { and, eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { driverDocuments, drivers, vehicles } from '../../shared/db/schema';
import { users } from '../../shared/db/schema';
import { createSession } from '../../shared/lib/didit';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { uploadFile } from '../../shared/lib/storage';
import type { AuthUser } from '../../shared/middleware/auth';

const VALID_DOC_TYPES = [
  'license',
  'registration',
  'insurance',
  'background_check',
  'drivers_license',
  'vehicle_registration',
  'vehicle_insurance',
];

async function getOrThrow(user: AuthUser) {
  const [driver] = await db.select().from(drivers).where(eq(drivers.user_id, user.id)).limit(1);

  if (!driver) throw new NotFoundError('Driver profile not found. Complete step 1 first');
  return driver;
}

async function createKycSession(userId: string): Promise<{
  session_token: string;
  session_url: string;
} | null> {
  try {
    return await createSession(userId);
  } catch (err) {
    logger.warn('[ONBOARDING] Failed to create DIDIT session', {
      userId: userId.split('-')[0],
      error: (err as Error).message,
    });
    return null;
  }
}

export const onboardingService = {
  async step1(user: AuthUser, fullName: string) {
    const [existing] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (existing) {
      await db
        .update(drivers)
        .set({ status: 'step2', updated_at: new Date() })
        .where(eq(drivers.id, existing.id));

      if (fullName) {
        await db
          .update(users)
          .set({ full_name: fullName, updated_at: new Date() })
          .where(eq(users.id, user.id));
      }

      return { id: existing.id, status: 'step2', message: 'Step 1 completed' };
    }

    if (fullName) {
      await db
        .update(users)
        .set({ full_name: fullName, updated_at: new Date() })
        .where(eq(users.id, user.id));
    }

    const [newDriver] = await db
      .insert(drivers)
      .values({ user_id: user.id, status: 'step2' })
      .returning({ id: drivers.id });

    if (!newDriver) throw new AppError('Failed to create driver profile', 400, 'BAD_REQUEST');

    return { id: newDriver.id, status: 'step2', message: 'Step 1 completed' };
  },

  async step2(
    user: AuthUser,
    data: {
      brand: string;
      model: string;
      year: number;
      color: string;
      plate: string;
      vehicle_type?: string;
    },
  ) {
    const driver = await getOrThrow(user);

    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driver_id: driver.id,
        brand: data.brand,
        model: data.model,
        year: data.year,
        color: data.color,
        plate: data.plate,
        vehicle_type: data.vehicle_type ?? 'car',
      })
      .returning({ id: vehicles.id });

    if (!vehicle) throw new AppError('Failed to create vehicle', 400, 'BAD_REQUEST');

    await db
      .update(drivers)
      .set({ status: 'step3', updated_at: new Date() })
      .where(eq(drivers.id, driver.id));

    return { vehicle_id: vehicle.id, status: 'step3', message: 'Step 2 completed' };
  },

  async step3(user: AuthUser, docs: { doc_type: string; file_url: string }[]) {
    const driver = await getOrThrow(user);

    for (const d of docs) {
      if (!VALID_DOC_TYPES.includes(d.doc_type)) {
        throw new AppError(`Invalid doc_type: ${d.doc_type}`, 400, 'BAD_REQUEST');
      }
    }

    const created = await db
      .insert(driverDocuments)
      .values(
        docs.map((d) => ({
          driver_id: driver.id,
          doc_type: d.doc_type,
          file_url: d.file_url,
        })),
      )
      .returning({
        id: driverDocuments.id,
        doc_type: driverDocuments.doc_type,
        file_url: driverDocuments.file_url,
        verified_at: driverDocuments.verified_at,
        expires_at: driverDocuments.expires_at,
      });

    await db
      .update(drivers)
      .set({ status: 'kyc', kyc_status: 'in_progress', updated_at: new Date() })
      .where(eq(drivers.id, driver.id));

    const kycSession = await createKycSession(user.id);

    return {
      documents: created,
      status: 'kyc',
      message: 'Step 3 completed',
      kyc_session: kycSession,
    };
  },

  async uploadDocument(user: AuthUser, file: File, docType: string) {
    const driver = await getOrThrow(user);

    if (!VALID_DOC_TYPES.includes(docType)) {
      throw new AppError(`Invalid doc_type: ${docType}`, 400, 'BAD_REQUEST');
    }

    const path = `${driver.id}/${docType}-${Date.now()}`;
    const fileUrl = await uploadFile(file, path);

    const [doc] = await db
      .insert(driverDocuments)
      .values({
        driver_id: driver.id,
        doc_type: docType,
        file_url: fileUrl,
      })
      .returning({
        id: driverDocuments.id,
        doc_type: driverDocuments.doc_type,
        file_url: driverDocuments.file_url,
        verified_at: driverDocuments.verified_at,
        expires_at: driverDocuments.expires_at,
      });

    if (!doc) throw new AppError('Failed to upload document', 400, 'BAD_REQUEST');

    await db
      .update(drivers)
      .set({ status: 'kyc', kyc_status: 'in_progress', updated_at: new Date() })
      .where(eq(drivers.id, driver.id));

    const kycSession = await createKycSession(user.id);

    return { id: doc.id, doc_type: doc.doc_type, file_url: doc.file_url, kyc_session: kycSession };
  },

  async getStatus(user: AuthUser) {
    const [driver] = await db.select().from(drivers).where(eq(drivers.user_id, user.id)).limit(1);

    if (!driver) {
      return {
        step: 'step1',
        driver_status: null,
        kyc_status: null,
        has_vehicle: false,
        documents_submitted: 0,
      };
    }

    const vehicleList = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.driver_id, driver.id))
      .limit(1);

    const docsList = await db
      .select({ id: driverDocuments.id })
      .from(driverDocuments)
      .where(eq(driverDocuments.driver_id, driver.id));

    return {
      step: driver.status,
      driver_status: driver.status,
      kyc_status: driver.kyc_status,
      has_vehicle: vehicleList.length > 0,
      documents_submitted: docsList.length,
    };
  },
};
