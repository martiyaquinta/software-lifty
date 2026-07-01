import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { logger } from '../lib/logger';
import { db } from './client';

await migrate(db, { migrationsFolder: './src/shared/db/migrations' });
logger.info('Migrations applied');
process.exit(0);
