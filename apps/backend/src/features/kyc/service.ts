import { and, eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { drivers } from '../../shared/db/schema';
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

export const kycService = {
  async getSession(user: AuthUser, driverId: string) {
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(and(eq(drivers.id, driverId), eq(drivers.user_id, user.id)))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver not found or does not belong to you');

    return createSession(driverId);
  },

  async processWebhook(driverId: string, status: string) {
    if (!VALID_STATUSES.includes(status)) {
      throw new AppError(`Invalid status: ${status}`, 400, 'BAD_REQUEST');
    }

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);

    if (!driver) throw new NotFoundError('Driver not found');

    const allowed = ALLOWED_TRANSITIONS[driver.kyc_status] ?? [];
    if (!allowed.includes(status)) {
      throw new AppError(
        `Invalid status transition from ${driver.kyc_status} to ${status}`,
        400,
        'BAD_REQUEST',
      );
    }

    const updateData: Record<string, any> = {
      kyc_status: status,
      updated_at: new Date(),
    };

    if (status === 'approved') {
      updateData.status = 'approved';
    }

    await db.update(drivers).set(updateData).where(eq(drivers.id, driverId));

    logger.info('[KYC]', driverId, driver.kyc_status, '→', status);
  },
};
