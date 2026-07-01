import { and, desc, eq, sql, sum } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { getDriverId } from '../../shared/db/queries';
import { drivers, payments, payoutMethods, trips, withdrawals } from '../../shared/db/schema';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { createWithdrawal, getPayment } from '../../shared/lib/mercado-pago';
import { calculatePlatformFee } from '../../shared/lib/pricing';
import type { AuthUser } from '../../shared/middleware/auth';

export const paymentsService = {
  async processWebhook(body: { payment_id: string; trip_id: string; status?: string }) {
    logger.info('[PAYMENTS] Webhook processed', { paymentId: body.payment_id });
    const paymentInfo = await getPayment(body.payment_id);

    if (paymentInfo.status !== 'approved') {
      throw new AppError(`Payment not approved: ${paymentInfo.status}`, 400, 'BAD_REQUEST');
    }

    const totalAmount = paymentInfo.amount;
    const platformAmount = calculatePlatformFee(totalAmount);
    const driverAmount = totalAmount - platformAmount;

    await db
      .insert(payments)
      .values({
        trip_id: body.trip_id,
        amount: totalAmount,
        platform_amount: platformAmount,
        driver_amount: driverAmount,
        mp_payment_id: body.payment_id,
        status: paymentInfo.status,
      })
      .onConflictDoNothing({ target: [payments.mp_payment_id] });

    return { message: 'Webhook processed' };
  },

  async getPaymentHistory(user: AuthUser, page: number, limit: number) {
    const driverId = await getDriverId(user);
    const offset = (page - 1) * limit;

    const paymentList = await db
      .select({
        id: payments.id,
        trip_id: payments.trip_id,
        amount: payments.amount,
        platform_amount: payments.platform_amount,
        driver_amount: payments.driver_amount,
        status: payments.status,
        mp_payment_id: payments.mp_payment_id,
        created_at: payments.created_at,
      })
      .from(payments)
      .innerJoin(trips, eq(payments.trip_id, trips.id))
      .where(eq(trips.driver_id, driverId))
      .orderBy(desc(payments.created_at))
      .limit(limit)
      .offset(offset);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(payments)
      .innerJoin(trips, eq(payments.trip_id, trips.id))
      .where(eq(trips.driver_id, driverId));

    return {
      payments: paymentList.map((p) => ({
        ...p,
        created_at: p.created_at?.toISOString() ?? null,
      })),
      total: countRow?.count ?? 0,
      page,
      limit,
    };
  },

  async withdraw(user: AuthUser, amount: number, payoutMethodId: string) {
    const driverId = await getDriverId(user);
    logger.info('[PAYMENTS] Withdrawal requested', { driverId, amount });

    const [pm] = await db
      .select({ id: payoutMethods.id, account_number: payoutMethods.account_number })
      .from(payoutMethods)
      .where(and(eq(payoutMethods.id, payoutMethodId), eq(payoutMethods.driver_id, driverId)))
      .limit(1);

    if (!pm) throw new NotFoundError('Payout method not found');

    const [withdrawal] = await db.transaction(async (tx) => {
      await tx
        .select({ id: withdrawals.id })
        .from(withdrawals)
        .where(eq(withdrawals.driver_id, driverId))
        .for('update');

      await tx
        .select({ id: payments.id })
        .from(payments)
        .innerJoin(trips, eq(payments.trip_id, trips.id))
        .where(eq(trips.driver_id, driverId))
        .for('update');

      const [earningsRow] = await tx
        .select({ total: sum(payments.driver_amount) })
        .from(payments)
        .innerJoin(trips, eq(payments.trip_id, trips.id))
        .where(eq(trips.driver_id, driverId));

      const totalEarnings = earningsRow?.total ?? 0;

      const [withdrawnRow] = await tx
        .select({ total: sum(withdrawals.amount) })
        .from(withdrawals)
        .where(eq(withdrawals.driver_id, driverId));

      const totalWithdrawn = withdrawnRow?.total ?? 0;

      const availableBalance = Number(totalEarnings) - Number(totalWithdrawn);

      if (availableBalance < amount) {
        throw new AppError('Insufficient balance', 400, 'BAD_REQUEST');
      }

      return tx
        .insert(withdrawals)
        .values({
          driver_id: driverId,
          amount,
          payout_method_id: payoutMethodId,
          status: 'processing',
        })
        .returning();
    });

    let mpResult;
    try {
      mpResult = await createWithdrawal(amount, pm.account_number, undefined, withdrawal.id);
    } catch (err) {
      await db
        .update(withdrawals)
        .set({ status: 'failed' })
        .where(eq(withdrawals.id, withdrawal.id));
      throw err;
    }

    await db
      .update(withdrawals)
      .set({ status: mpResult.status, mp_withdrawal_id: mpResult.id })
      .where(eq(withdrawals.id, withdrawal.id));

    return {
      withdrawal_id: withdrawal.id,
      amount,
      status: mpResult.status,
    };
  },

  async getWithdrawals(user: AuthUser) {
    const driverId = await getDriverId(user);

    const withdrawalList = await db
      .select({
        id: withdrawals.id,
        amount: withdrawals.amount,
        payout_method_id: withdrawals.payout_method_id,
        mp_withdrawal_id: withdrawals.mp_withdrawal_id,
        status: withdrawals.status,
        created_at: withdrawals.created_at,
      })
      .from(withdrawals)
      .where(eq(withdrawals.driver_id, driverId))
      .orderBy(desc(withdrawals.created_at));

    return {
      withdrawals: withdrawalList.map((w) => ({
        ...w,
        created_at: w.created_at?.toISOString() ?? null,
      })),
    };
  },
};
