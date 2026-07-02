import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, resetDb } from '../src/shared/db/client';

const db = getDb();
console.log('📦 Applying migrations...');
await migrate(db, { migrationsFolder: './src/shared/db/migrations' });
console.log('✅ Migrations applied');
resetDb();
