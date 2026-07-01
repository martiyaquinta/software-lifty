import { doublePrecision, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { trips } from './trips';

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  trip_id: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  amount: doublePrecision('amount').notNull(),
  platform_amount: doublePrecision('platform_amount').notNull(),
  driver_amount: doublePrecision('driver_amount').notNull(),
  method: varchar('method', { length: 30 }).notNull().default('mercadopago'),
  mp_payment_id: varchar('mp_payment_id', { length: 100 }).unique(),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
