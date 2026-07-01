import { eq } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';
import type { AuthUser } from '../middleware/auth';
import { db } from './client';
import { drivers } from './schema';

export async function getDriverId(user: AuthUser): Promise<string> {
  const [driver] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.user_id, user.id))
    .limit(1);

  if (!driver) throw new NotFoundError('Driver profile required');
  return driver.id;
}

export async function getDriverIdByUserId(userId: string): Promise<string> {
  const [driver] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.user_id, userId))
    .limit(1);

  if (!driver) throw new NotFoundError('Driver profile not found');
  return driver.id;
}
