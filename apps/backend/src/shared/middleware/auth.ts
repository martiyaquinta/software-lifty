import type { User } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { db } from '../db/client';
import { users } from '../db/schema';
import { logger } from '../lib/logger';
import { getSupabaseClient } from '../lib/supabase';

export interface AuthUser {
  id: string;
  role: string;
  email: string | null;
  phone: string | null;
}

export type AuthStatus = 'no_token' | 'token_expired' | 'token_invalid' | 'authenticated';

type ResolveUser = (token: string) => Promise<AuthUser | null>;

function realGetUser(token: string): Promise<AuthUser | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    logger.warn('[AUTH] Supabase client not configured, rejecting all requests');
    return Promise.resolve(null);
  }
  return supabase.auth.getUser(token).then(({ data, error }) => {
    if (error || !data.user) return null;
    return findOrCreateUser(data.user);
  });
}

async function findOrCreateUser(supabaseUser: User): Promise<AuthUser | null> {
  const [existing] = await db
    .select({
      id: users.id,
      role: users.role,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, supabaseUser.id))
    .limit(1);

  if (existing) {
    return {
      id: existing.id,
      role: existing.role,
      email: existing.email,
      phone: existing.phone,
    };
  }

  const [created] = await db
    .insert(users)
    .values({
      id: supabaseUser.id,
      email: supabaseUser.email ?? null,
      phone: (supabaseUser as { phone?: string }).phone ?? null,
      role: 'driver',
    })
    .returning({
      id: users.id,
      role: users.role,
      email: users.email,
      phone: users.phone,
    });

  if (!created) return null;

  return {
    id: created.id,
    role: created.role,
    email: created.email,
    phone: created.phone,
  };
}

export function createAuthPlugin(resolveUser?: ResolveUser) {
  const getUser = resolveUser ?? realGetUser;

  return new Elysia({ name: 'auth' }).derive(
    { as: 'scoped' },
    async ({ request }): Promise<{ user: AuthUser | null; authStatus: AuthStatus }> => {
      const authHeader = request.headers.get('authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return { user: null, authStatus: 'no_token' };
      }

      try {
        const user = await getUser(authHeader.slice(7));
        if (!user) {
          return { user: null, authStatus: 'token_invalid' };
        }
        return { user, authStatus: 'authenticated' };
      } catch (err) {
        logger.warn('[AUTH] getUser failed', { error: (err as Error).message });
        return { user: null, authStatus: 'token_invalid' };
      }
    },
  );
}

export const authPlugin = createAuthPlugin();
