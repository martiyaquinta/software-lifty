import { doublePrecision, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { drivers } from './drivers';
import { payoutMethods } from './payout-methods';

export const withdrawals = pgTable('withdrawals', {
  id: uuid('id').defaultRandom().primaryKey(),
  driver_id: uuid('driver_id')
    .notNull()
    .references(() => drivers.id),
  amount: doublePrecision('amount').notNull(),
  payout_method_id: uuid('payout_method_id')
    .notNull()
    .references(() => payoutMethods.id),
  mp_withdrawal_id: varchar('mp_withdrawal_id', { length: 100 }).unique(),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
