import { boolean, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 20 }).unique(),
  email: varchar('email', { length: 255 }).unique(),
  password_hash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull().default('driver'),
  full_name: varchar('full_name', { length: 255 }),
  avatar_url: varchar('avatar_url', { length: 512 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  email_verified: boolean('email_verified').notNull().default(false),
  verification_code: varchar('verification_code', { length: 6 }),
  verification_code_expires_at: timestamp('verification_code_expires_at'),
});
