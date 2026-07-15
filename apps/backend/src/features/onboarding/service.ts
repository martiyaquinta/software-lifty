import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { driverDocuments, drivers, vehicles } from '../../shared/db/schema';
import { users } from '../../shared/db/schema';
import { createSession } from '../../shared/lib/didit';
import { DOC_TYPES } from '../../shared/lib/documents';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { uploadFile } from '../../shared/lib/storage';
import type { AuthUser } from '../../shared/middleware/auth';
import { notifyAdminsNewDocuments } from '../admin/notifications';

async function getOrThrow(user: AuthUser) {
  const [driver] = await db.select().from(drivers).where(eq(drivers.user_id, user.id)).limit(1);

  if (!driver) throw new NotFoundError('Driver profile not found. Complete step 1 first');
  return driver;
}

async function getUserKycStatus(userId: string): Promise<string> {
  const [u] = await db
    .select({ kyc_status: users.kyc_status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.kyc_status ?? 'pending';
}

async function createKycSession(userId: string): Promise<{
  session_id: string;
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

    if (fullName) {
      await db
        .update(users)
        .set({ full_name: fullName, updated_at: new Date() })
        .where(eq(users.id, user.id));
    }

    if (existing) {
      await db
        .update(drivers)
        .set({ status: 'kyc_pending', updated_at: new Date() })
        .where(eq(drivers.id, existing.id));

      const kycSession = await createKycSession(user.id);

      return {
        id: existing.id,
        status: 'kyc_pending',
        message: 'Step 1 completed. KYC required next.',
        kyc_session: kycSession,
      };
    }

    const [newDriver] = await db
      .insert(drivers)
      .values({ user_id: user.id, status: 'kyc_pending' })
      .returning({ id: drivers.id });

    if (!newDriver) throw new AppError('Failed to create driver profile', 400, 'BAD_REQUEST');

    const kycSession = await createKycSession(user.id);

    return {
      id: newDriver.id,
      status: 'kyc_pending',
      message: 'Step 1 completed. KYC required next.',
      kyc_session: kycSession,
    };
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

    const kycStatus = await getUserKycStatus(user.id);
    if (kycStatus !== 'approved') {
      throw new AppError(
        'KYC verification must be completed before adding a vehicle',
        400,
        'KYC_REQUIRED',
      );
    }

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
      .set({ status: 'documents', updated_at: new Date() })
      .where(eq(drivers.id, driver.id));

    return { vehicle_id: vehicle.id, status: 'documents', message: 'Step 2 completed' };
  },

  async step3(user: AuthUser, docs: { doc_type: string; file_url: string }[]) {
    const driver = await getOrThrow(user);

    const kycStatus = await getUserKycStatus(user.id);
    if (kycStatus !== 'approved') {
      throw new AppError(
        'KYC verification must be completed before uploading documents',
        400,
        'KYC_REQUIRED',
      );
    }

    for (const d of docs) {
      if (!(DOC_TYPES as readonly string[]).includes(d.doc_type)) {
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

    const uploaded = await db
      .select({ doc_type: driverDocuments.doc_type })
      .from(driverDocuments)
      .where(
        and(eq(driverDocuments.driver_id, driver.id), ne(driverDocuments.status, 'superseded')),
      );

    const uploadedTypes = new Set(uploaded.map((d) => d.doc_type));
    let status: string = driver.status;
    let message = 'Documents uploaded successfully.';

    if (DOC_TYPES.every((t) => uploadedTypes.has(t))) {
      await db
        .update(drivers)
        .set({ status: 'review', admin_review_status: 'pending', updated_at: new Date() })
        .where(eq(drivers.id, driver.id));
      status = 'review';
      message = 'Step 3 completed. Documents submitted for review.';
    }

    {
      const [userRow] = await db
        .select({ full_name: users.full_name })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      notifyAdminsNewDocuments(userRow?.full_name ?? 'Driver', driver.id);
    }

    return {
      documents: created,
      status,
      message,
    };
  },

  async uploadDocument(user: AuthUser, file: File, docType: string) {
    const driver = await getOrThrow(user);

    const kycStatus = await getUserKycStatus(user.id);
    if (kycStatus !== 'approved') {
      throw new AppError(
        'KYC verification must be completed before uploading documents',
        400,
        'KYC_REQUIRED',
      );
    }

    if (!(DOC_TYPES as readonly string[]).includes(docType)) {
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

    const uploaded = await db
      .select({ doc_type: driverDocuments.doc_type })
      .from(driverDocuments)
      .where(
        and(eq(driverDocuments.driver_id, driver.id), ne(driverDocuments.status, 'superseded')),
      );

    const uploadedTypes = new Set(uploaded.map((d) => d.doc_type));
    if (DOC_TYPES.every((t) => uploadedTypes.has(t))) {
      await db
        .update(drivers)
        .set({ status: 'review', admin_review_status: 'pending', updated_at: new Date() })
        .where(eq(drivers.id, driver.id));
    }

    {
      const [userRow] = await db
        .select({ full_name: users.full_name })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      notifyAdminsNewDocuments(userRow?.full_name ?? 'Driver', driver.id);
    }

    return { id: doc.id, doc_type: doc.doc_type, file_url: doc.file_url };
  },

  async getStatus(user: AuthUser) {
    const [driver] = await db.select().from(drivers).where(eq(drivers.user_id, user.id)).limit(1);

    const userKycStatus = await getUserKycStatus(user.id);

    if (!driver) {
      return {
        step: 'step1',
        driver_status: null,
        kyc_status: userKycStatus,
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
      kyc_status: userKycStatus,
      has_vehicle: vehicleList.length > 0,
      documents_submitted: docsList.length,
    };
  },
};
