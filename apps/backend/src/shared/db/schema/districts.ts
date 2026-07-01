import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core';

export const districts = pgTable('districts', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  province: varchar('province', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
});
