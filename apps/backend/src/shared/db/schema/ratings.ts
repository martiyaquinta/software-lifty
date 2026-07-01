import { integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { trips } from './trips';
import { users } from './users';

export const ratings = pgTable('ratings', {
  id: uuid('id').defaultRandom().primaryKey(),
  trip_id: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  rater_id: uuid('rater_id')
    .notNull()
    .references(() => users.id),
  ratee_id: uuid('ratee_id')
    .notNull()
    .references(() => users.id),
  score: integer('score').notNull(),
  tags: varchar('tags', { length: 255 }),
  comment: varchar('comment', { length: 500 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
});
