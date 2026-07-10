import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { db } from '../db/client';
import { users } from '../db/schema';
import { type VerifyResult, verifyAccess } from '../lib/jwt';

export interface AuthUser {
  id: string;
  role: string;
  email: string | null;
  phone: string | null;
}

export type AuthStatus = 'no_token' | 'token_expired' | 'token_invalid' | 'authenticated';

export const authPlugin = new Elysia({ name: 'auth' }).derive(
  { as: 'scoped' },
  async ({ request }): Promise<{ user: AuthUser | null; authStatus: AuthStatus }> => {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return { user: null, authStatus: 'no_token' };
    }

    const token = authHeader.slice(7);
    const result: VerifyResult = await verifyAccess(token);
    if (!result.ok) {
      return {
        user: null,
        authStatus: result.reason === 'expired' ? 'token_expired' : 'token_invalid',
      };
    }

    const userRow = await db
      .select({
        id: users.id,
        role: users.role,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, result.payload.sub))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    // A valid token whose subject has no matching user is NOT authenticated.
    // Users are created exclusively through POST /auth/register — never here.
    // Auto-provisioning let anyone with any valid JWT (e.g. a Supabase token)
    // gain a `driver` account without going through registration.
    if (!userRow) {
      return { user: null, authStatus: 'token_invalid' };
    }

    return { user: userRow, authStatus: 'authenticated' };
  },
);
