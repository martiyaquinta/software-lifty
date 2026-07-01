import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { trips } from './trips';

export const tripEvents = pgTable('trip_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  trip_id: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  from_status: varchar('from_status', { length: 30 }),
  to_status: varchar('to_status', { length: 30 }).notNull(),
  changed_at: timestamp('changed_at').defaultNow().notNull(),
});
