import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { drivers } from './drivers';

export const payoutMethods = pgTable('payout_methods', {
  id: uuid('id').defaultRandom().primaryKey(),
  driver_id: uuid('driver_id')
    .notNull()
    .references(() => drivers.id, { onDelete: 'cascade' }),
  method_type: varchar('method_type', { length: 20 }).notNull(),
  account_number: varchar('account_number', { length: 50 }).notNull(),
  titular_name: varchar('titular_name', { length: 255 }),
  wallet: varchar('wallet', { length: 100 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
