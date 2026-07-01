import { pgTable, real, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { trips } from './trips';
import { users } from './users';

export const sosEvents = pgTable('sos_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  trip_id: uuid('trip_id').references(() => trips.id),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  type: varchar('type', { length: 50 }).notNull(),
  description: varchar('description', { length: 500 }),
  lat: real('lat'),
  lng: real('lng'),
  accident_type: varchar('accident_type', { length: 50 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
