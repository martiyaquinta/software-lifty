import { eq, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { driverDocuments, drivers, users, vehicles } from '../../shared/db/schema';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import type { AuthUser } from '../../shared/middleware/auth';

export const adminService = {
  async listPending() {
    const rows = await db
      .select({
        id: drivers.id,
        user_id: drivers.user_id,
        full_name: users.full_name,
        email: users.email,
        phone: users.phone,
        status: drivers.status,
        kyc_status: users.kyc_status,
        admin_review_status: drivers.admin_review_status,
        created_at: drivers.created_at,
        documents_submitted: sql<number>`(SELECT COUNT(*) FROM ${driverDocuments} WHERE ${driverDocuments.driver_id} = ${drivers.id})::int`,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(eq(drivers.status, 'review'))
      .orderBy(drivers.created_at);

    return rows;
  },

  async getDriverDetail(driverId: string) {
    const [driver] = await db
      .select({
        id: drivers.id,
        user_id: drivers.user_id,
        full_name: users.full_name,
        email: users.email,
        phone: users.phone,
        status: drivers.status,
        kyc_status: users.kyc_status,
        verified_name: users.verified_name,
        document_number_last4: users.document_number_last4,
        admin_review_status: drivers.admin_review_status,
        admin_reviewed_at: drivers.admin_reviewed_at,
        admin_review_notes: drivers.admin_review_notes,
        created_at: drivers.created_at,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver not found');

    const vehicleRows = await db.select().from(vehicles).where(eq(vehicles.driver_id, driver.id));

    const documentRows = await db
      .select({
        id: driverDocuments.id,
        doc_type: driverDocuments.doc_type,
        file_url: driverDocuments.file_url,
        created_at: driverDocuments.created_at,
      })
      .from(driverDocuments)
      .where(eq(driverDocuments.driver_id, driver.id));

    return {
      ...driver,
      vehicles: vehicleRows,
      documents: documentRows,
    };
  },

  async reviewDriver(
    adminUser: AuthUser,
    driverId: string,
    action: 'approve' | 'reject',
    notes?: string,
  ) {
    const [driver] = await db
      .select({
        id: drivers.id,
        status: drivers.status,
        admin_review_status: drivers.admin_review_status,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver not found');

    if (driver.admin_review_status !== 'pending') {
      throw new AppError(`Driver already ${driver.admin_review_status}`, 400, 'ALREADY_REVIEWED');
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await db
      .update(drivers)
      .set({
        status: newStatus,
        admin_review_status: newStatus,
        admin_reviewed_by: adminUser.id,
        admin_reviewed_at: new Date(),
        admin_review_notes: notes ?? null,
        updated_at: new Date(),
      })
      .where(eq(drivers.id, driverId));

    return {
      driver_id: driver.id,
      action,
      status: newStatus,
      message: `Driver ${action === 'approve' ? 'approved' : 'rejected'}`,
    };
  },
};
