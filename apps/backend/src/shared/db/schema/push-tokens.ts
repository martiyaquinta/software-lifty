import { pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

// One row per (user, device token): a user can hold several devices.
// Matches migration 0010, which replaced the old per-user unique.
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 512 }).notNull(),
    platform: varchar('platform', { length: 20 }).notNull().default('android'),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('push_tokens_user_device_unique').on(table.user_id, table.token)],
);
