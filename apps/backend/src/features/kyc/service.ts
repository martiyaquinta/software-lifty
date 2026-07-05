import { createHash } from 'node:crypto';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { drivers, users } from '../../shared/db/schema';
import { createSession } from '../../shared/lib/didit';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import type { AuthUser } from '../../shared/middleware/auth';

const VALID_STATUSES = [
  'pending',
  'in_progress',
  'under_review',
  'approved',
  'rejected',
  'expired',
];

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_progress'],
  in_progress: ['under_review'],
  under_review: ['approved', 'rejected', 'expired'],
  approved: [],
  rejected: [],
  expired: [],
};

function hashDocumentNumber(documentNumber: string): string {
  return createHash('sha256').update(documentNumber).digest('hex');
}

export const kycService = {
  async getSession(user: AuthUser, driverId: string) {
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(and(eq(drivers.id, driverId), eq(drivers.user_id, user.id)))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver not found or does not belong to you');

    return createSession(user.id);
  },

  async processWebhook(
    userId: string,
    status: string,
    webhookData?: { documentNumber?: string; fullName?: string },
  ) {
    if (!VALID_STATUSES.includes(status)) {
      throw new AppError(`Invalid status: ${status}`, 400, 'BAD_REQUEST');
    }

    const [user] = await db
      .select({
        id: users.id,
        kyc_status: users.kyc_status,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) throw new NotFoundError('User not found');

    const allowed = ALLOWED_TRANSITIONS[user.kyc_status] ?? [];
    if (!allowed.includes(status)) {
      throw new AppError(
        `Invalid status transition from ${user.kyc_status} to ${status}`,
        400,
        'BAD_REQUEST',
      );
    }

    const userUpdateData: Record<string, unknown> = {
      kyc_status: status,
      updated_at: new Date(),
    };

    if (status === 'approved' && webhookData?.fullName) {
      userUpdateData.verified_name = webhookData.fullName;
    }

    if (status === 'approved' && webhookData?.documentNumber) {
      const docHash = hashDocumentNumber(webhookData.documentNumber);
      const last4 = webhookData.documentNumber.slice(-4);

      const [duplicate] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.verified_document_hash, docHash),
            ne(users.id, user.id),
            isNotNull(users.verified_document_hash),
          ),
        )
        .limit(1);

      if (duplicate) {
        logger.warn('[KYC] Duplicate document detected', {
          userId: userId.split('-')[0],
          duplicateUserId: duplicate.id.split('-')[0],
        });
      }

      userUpdateData.verified_document_hash = docHash;
      userUpdateData.document_number_last4 = last4;
    }

    await db.update(users).set(userUpdateData).where(eq(users.id, userId));

    const driverUpdateData: Record<string, unknown> = {
      kyc_status: status,
      updated_at: new Date(),
    };

    if (status === 'approved') {
      driverUpdateData.status = 'approved';
    }

    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, userId))
      .limit(1);

    if (driver) {
      await db.update(drivers).set(driverUpdateData).where(eq(drivers.id, driver.id));
    }

    logger.info('[KYC]', userId.split('-')[0], user.kyc_status, '→', status);
  },
};
