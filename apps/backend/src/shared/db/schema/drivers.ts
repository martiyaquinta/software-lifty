import { boolean, integer, pgTable, real, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const drivers = pgTable('drivers', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 30 }).notNull().default('step1'),
  rating_avg: real('rating_avg').default(0),
  total_trips: integer('total_trips').default(0),
  completion_rate: real('completion_rate').default(0),
  kyc_status: varchar('kyc_status', { length: 30 }).notNull().default('pending'),
  is_online: boolean('is_online').default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});
