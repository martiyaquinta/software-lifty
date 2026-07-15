# Auth Supabase SDK Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all custom auth code from the backend and delegate authentication entirely to Supabase via `supabase.auth.getUser()`.

**Architecture:** The authPlugin creates a Supabase client with `SUPABASE_PUBLISHABLE_KEY`, calls `getUser(jwt)` for every request, looks up/auto-creates the user in `users` by `sub`, and injects `{ user, authStatus }`. Tests use dependency injection (a mock `getUser` that looks up the DB directly) so no Supabase Auth instance is needed for testing. All legacy JWT signing, password hashing, refresh tokens, and auth endpoints are deleted.

**Tech Stack:** Bun + Elysia + Drizzle + Supabase JS SDK (`@supabase/supabase-js`)

**Spec:** `docs/superpowers/specs/2026-07-15-auth-supabase-sdk-migration-design.md`

---

### Task 1: Shared Supabase client for backend auth

**Files:**
- Create: `apps/backend/src/shared/lib/supabase.ts`

- [ ] **Step 1: Create the shared Supabase client module**

```typescript
import { createClient } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (url && key) {
      client = createClient(url, key, {
        auth: { persistSession: false },
      });
    }
  }
  return client;
}
```

- [ ] **Step 2: Verify typecheck passes on the new file**

Run: `bun --filter @lifty/backend run typecheck`
Expected: no errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/shared/lib/supabase.ts
git commit -S -m "feat: add shared Supabase client for backend auth"
```

---

### Task 2: Rewrite authPlugin with dependency injection

**Files:**
- Modify: `apps/backend/src/shared/middleware/auth.ts`

- [ ] **Step 1: Read current auth.ts**

Read `apps/backend/src/shared/middleware/auth.ts` to understand the current structure.

- [ ] **Step 2: Rewrite auth.ts**

```typescript
import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import type { AuthError, User } from '@supabase/supabase-js';
import { db } from '../db/client';
import { users } from '../db/schema';
import { getSupabaseClient } from '../lib/supabase';
import { logger } from '../lib/logger';

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
  let [userRow] = await db
    .select({
      id: users.id,
      role: users.role,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, supabaseUser.id))
    .limit(1);

  if (!userRow) {
    [userRow] = await db
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
  }

  return {
    id: userRow.id,
    role: userRow.role,
    email: userRow.email,
    phone: userRow.phone,
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
      } catch {
        return { user: null, authStatus: 'token_invalid' };
      }
    },
  );
}

export const authPlugin = createAuthPlugin();
```

- [ ] **Step 3: Check that the current `authPlugin` export shape still works**

The `authPlugin` constant export (`new Elysia({ name: 'auth' })`) must stay — it's imported in `src/index.ts:23` and used in all tests via `createApp()`. The `createAuthPlugin()` factory returns the same shape.

Run: `bun --filter @lifty/backend run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/shared/middleware/auth.ts
git commit -S -m "refactor: rewrite authPlugin to use supabase.auth.getUser with dependency injection"
```

---

### Task 3: Auth middleware tests

**Files:**
- Modify: `apps/backend/src/shared/middleware/auth.test.ts`

- [ ] **Step 1: Rewrite auth.test.ts**

```typescript
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { db } from '../db/client';
import { users } from '../db/schema';
import { getRedis } from '../lib/redis';
import { createAuthPlugin } from './auth';

let app: any;

function buildApp() {
  const plugin = createAuthPlugin(async (token) => {
    const [row] = await db
      .select({
        id: users.id,
        role: users.role,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, token))
      .limit(1);
    return row ?? null;
  });

  return new Elysia()
    .use(plugin)
    .get('/test', ({ user, authStatus }) => ({ user: user ?? null, authStatus }));
}

async function makeRequest(token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const req = new Request('http://localhost/test', { headers });
  const res = await app.handle(req);
  return res.json();
}

beforeEach(async () => {
  await db.delete(users);
  app = buildApp();

  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys('ratelimit:*');
      if (keys.length > 0) await redis.del(...keys);
    } catch { /* best-effort */ }
  }
});

afterAll(async () => {
  await db.delete(users);
});

describe('authPlugin', () => {
  test('returns no_token when no Authorization header', async () => {
    const res = await makeRequest();
    expect(res.user).toBeNull();
    expect(res.authStatus).toBe('no_token');
  });

  test('returns no_token when header is not Bearer', async () => {
    const headers: Record<string, string> = { 'Authorization': 'Basic abc123' };
    const req = new Request('http://localhost/test', { headers });
    const res = await app.handle(req);
    const data = await res.json();
    expect(data.user).toBeNull();
    expect(data.authStatus).toBe('no_token');
  });

  test('returns token_invalid for unknown user', async () => {
    const res = await makeRequest('non-existent-uuid');
    expect(res.user).toBeNull();
    expect(res.authStatus).toBe('token_invalid');
  });

  test('returns authenticated for known user', async () => {
    await db
      .insert(users)
      .values({ id: 'test-user-1', role: 'driver', phone: '+1234567890' })
      .returning();

    const res = await makeRequest('test-user-1');
    expect(res.user).not.toBeNull();
    expect(res.user.id).toBe('test-user-1');
    expect(res.user.role).toBe('driver');
    expect(res.authStatus).toBe('authenticated');
  });
});
```

- [ ] **Step 2: Run the auth middleware tests**

Run: `bun test src/shared/middleware/auth.test.ts`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/shared/middleware/auth.test.ts
git commit -S -m "test: rewrite auth middleware tests for supabase.getUser"
```

---

### Task 4: Clean auth service — getMe + no-op logout

**Files:**
- Modify: `apps/backend/src/features/auth/service.ts`

- [ ] **Step 1: Replace service.ts with minimal version**

```typescript
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { users } from '../../shared/db/schema';
import { logger } from '../../shared/lib/logger';
import { NotFoundError } from '../../shared/lib/errors';
import type { AuthUser } from '../../shared/middleware/auth';

export const authService = {
  async getMe(user: AuthUser) {
    const [row] = await db
      .select({
        id: users.id,
        phone: users.phone,
        email: users.email,
        role: users.role,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
        created_at: users.created_at,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!row) throw new NotFoundError('User not found');

    return {
      id: row.id,
      phone: row.phone,
      email: row.email,
      role: row.role,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      created_at: row.created_at?.toISOString() ?? null,
    };
  },

  async logout(user: AuthUser) {
    logger.info('[AUTH] Logout', { userId: user.id.split('-')[0] });
    return { message: 'Logged out successfully' };
  },
};
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter @lifty/backend run typecheck`
Expected: no errors related to auth service.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/features/auth/service.ts
git commit -S -m "refactor: strip auth service to getMe + no-op logout"
```

---

### Task 5: Clean auth routes + schema

**Files:**
- Modify: `apps/backend/src/features/auth/routes.ts`
- Modify: `apps/backend/src/features/auth/schema.ts`

- [ ] **Step 1: Replace routes.ts with minimal version**

```typescript
import { Elysia } from 'elysia';
import { logger } from '../../shared/lib/logger';
import { safeCall } from '../../shared/lib/route-utils';
import { authGuard } from '../../shared/middleware/require-auth';
import { authService } from './service';

export const authRoutes = new Elysia({ prefix: '/auth' })
  .use(authGuard)
  .get('/me', ({ user, set }) => safeCall(() => authService.getMe(user), set), {
    requireAuth: true,
  })
  .post(
    '/logout',
    ({ user, set }) => {
      logger.info('[AUTH:ROUTE] POST /auth/logout');
      return safeCall(() => authService.logout(user), set);
    },
    {
      requireAuth: true,
    },
  );
```

- [ ] **Step 2: Replace schema.ts with minimal version**

```typescript
import { t } from 'elysia';

export const messageResponse = t.Object({
  message: t.String(),
});

export const meResponse = t.Object({
  id: t.String(),
  phone: t.Union([t.String(), t.Null()]),
  email: t.Union([t.String(), t.Null()]),
  role: t.String(),
  full_name: t.Union([t.String(), t.Null()]),
  avatar_url: t.Union([t.String(), t.Null()]),
  created_at: t.Union([t.String(), t.Null()]),
});
```

- [ ] **Step 3: Verify typecheck**

Run: `bun --filter @lifty/backend run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/features/auth/routes.ts apps/backend/src/features/auth/schema.ts
git commit -S -m "refactor: strip auth routes to /me and /logout only"
```

---

### Task 6: Delete jwt.ts and refresh-tokens schema

**Files:**
- Delete: `apps/backend/src/shared/lib/jwt.ts`
- Delete: `apps/backend/src/shared/db/schema/refresh-tokens.ts`
- Modify: `apps/backend/src/shared/db/schema/index.ts`

- [ ] **Step 1: Delete the files**

```bash
rm apps/backend/src/shared/lib/jwt.ts
rm apps/backend/src/shared/db/schema/refresh-tokens.ts
```

- [ ] **Step 2: Update schema index.ts**

Read current `apps/backend/src/shared/db/schema/index.ts`. Remove the line:
```typescript
export { refreshTokens } from './refresh-tokens';
```

- [ ] **Step 3: Commit**

```bash
git add -u apps/backend/src/shared/lib/jwt.ts apps/backend/src/shared/db/schema/refresh-tokens.ts apps/backend/src/shared/db/schema/index.ts
git commit -S -m "refactor: delete jwt.ts and refresh-tokens schema"
```

---

### Task 7: Schema migration — users table + drop refresh_tokens

**Files:**
- Create: `apps/backend/supabase/migrations/<timestamp>_drop_auth_columns.sql`
- Modify: `apps/backend/src/shared/db/schema/users.ts`

- [ ] **Step 1: Create the migration SQL**

Get the timestamp: `date +%Y%m%d%H%M%S`

```sql
ALTER TABLE users
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS verification_code,
  DROP COLUMN IF EXISTS verification_code_expires_at,
  DROP COLUMN IF EXISTS verification_attempts,
  DROP COLUMN IF EXISTS reset_code,
  DROP COLUMN IF EXISTS reset_code_expires_at,
  DROP COLUMN IF EXISTS reset_attempts,
  DROP COLUMN IF EXISTS email_verified;

DROP TABLE IF EXISTS refresh_tokens;
```

- [ ] **Step 2: Update the Drizzle schema (users.ts)**

```typescript
import { boolean, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 20 }).unique(),
  email: varchar('email', { length: 255 }).unique(),
  role: varchar('role', { length: 20 }).notNull().default('driver'),
  full_name: varchar('full_name', { length: 255 }),
  avatar_url: varchar('avatar_url', { length: 512 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  kyc_status: varchar('kyc_status', { length: 30 }).notNull().default('pending'),
  verified_name: varchar('verified_name', { length: 255 }),
  verified_document_hash: varchar('verified_document_hash', { length: 64 }),
  document_number_last4: varchar('document_number_last4', { length: 4 }),
});
```

- [ ] **Step 3: Apply the migration**

```bash
bun run --filter @lifty/backend supabase db push
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/supabase/migrations/<timestamp>_drop_auth_columns.sql apps/backend/src/shared/db/schema/users.ts
git commit -S -m "feat: drop auth columns from users and refresh_tokens table"
```

---

### Task 8: Update testing utils (createTestToken + createTestAuthPlugin)

**Files:**
- Modify: `apps/backend/src/shared/testing/utils.ts`

- [ ] **Step 1: Rewrite testing utils**

```typescript
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import type { AuthUser } from '../../shared/middleware/auth';
import { createAuthPlugin } from '../../shared/middleware/auth';

export function createTestToken(userId: string): string {
  return userId;
}

export function createTestAuthPlugin() {
  return createAuthPlugin(async (token): Promise<AuthUser | null> => {
    const [row] = await db
      .select({
        id: users.id,
        role: users.role,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, token))
      .limit(1);

    return row ?? null;
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter @lifty/backend run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/shared/testing/utils.ts
git commit -S -m "test: rewrite createTestToken as plain userId, add createTestAuthPlugin"
```

---

### Task 9: Update testing setup

**Files:**
- Modify: `apps/backend/src/shared/testing/setup.ts`

- [ ] **Step 1: Remove JWT_SECRET from setup.ts**

Change line 4 from:
```typescript
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';
```
to: (remove the line entirely)

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/shared/testing/setup.ts
git commit -S -m "test: remove JWT_SECRET from test setup"
```

---

### Task 10: Update src/index.ts — validateEnv, swagger, authPlugin import

**Files:**
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Update validateEnv()**

Lines 29-40. Change from:
```typescript
function validateEnv() {
  const required = ['JWT_SECRET', 'DATABASE_URL', 'RESEND_API_KEY'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  if ((process.env.JWT_SECRET?.length ?? 0) < 32)
    throw new Error('JWT_SECRET must be at least 32 characters');
```
to:
```typescript
function validateEnv() {
  const required = ['SUPABASE_URL', 'DATABASE_URL', 'RESEND_API_KEY'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }
```

- [ ] **Step 2: Update swagger tag for auth (line ~60)**

Change from:
```typescript
{ name: 'auth', description: 'Autenticación, registro, login, JWT' },
```
to:
```typescript
{ name: 'auth', description: 'Perfil y logout (auth via Supabase)' },
```

- [ ] **Step 3: Verify typecheck**

Run: `bun --filter @lifty/backend run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/index.ts
git commit -S -m "refactor: update validateEnv and swagger for Supabase auth"
```

---

### Task 11: Rewrite all-endpoints.test.ts

**Files:**
- Modify: `apps/backend/src/all-endpoints.test.ts`

- [ ] **Step 1: Read the current file to identify auth sections to remove**

Read `apps/backend/src/all-endpoints.test.ts` fully.

- [ ] **Step 2: Remove auth endpoint test blocks**

Delete all test blocks that call:
- `POST /api/auth/register`
- `POST /api/auth/verify`
- `POST /api/auth/resend-code`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/login`
- `POST /api/auth/refresh`

These are typically in one large `describe('auth endpoints')` block.

- [ ] **Step 3: Update imports and setup**

Remove these lines from the top:
```typescript
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';
```

Change the `register()` helper (lines 74-85) — remove `password_hash: 'unused'`:
```typescript
async function register(
  phone: string,
  _password = 'testPass123',
  fullName = 'Test Driver',
): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: fullName, role: 'driver' })
    .returning({ id: users.id });
  return createTestToken(user.id);
}
```

Update `truncateAll()` — remove the line:
```typescript
await db.execute('DELETE FROM refresh_tokens');
```

- [ ] **Step 4: Verify no stale imports remain**

Search in the file for:
- `refresh_tokens` — should not appear
- `signAccess`, `signRefresh`, `JWT_SECRET` — should not appear

- [ ] **Step 5: Run the tests**

Run: `bun test src/all-endpoints.test.ts`
Expected: all tests pass (no auth-related tests remain, but all other endpoint tests do).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/all-endpoints.test.ts
git commit -S -m "test: remove auth endpoint tests from all-endpoints smoke test"
```

---

### Task 12: Update middleware tests (require-auth.test.ts, logout.test.ts)

**Files:**
- Modify: `apps/backend/src/shared/middleware/require-auth.test.ts`
- Modify: `apps/backend/src/features/auth/logout.test.ts`

- [ ] **Step 1: Update require-auth.test.ts**

Remove line 4 (`process.env.JWT_SECRET = ...`).

Remove the direct JWT signing in the test (lines 65, etc.):
```typescript
const secret = new TextEncoder().encode(process.env.JWT_SECRET as string);
// and the SignJWT block
```

Replace with `createTestToken`:
```typescript
import { createTestToken } from '../testing/utils';
// ...
const token = createTestToken(user.id);
```

Remove `refreshTokens` from import line 10.

Remove `await db.delete(refreshTokens)` from lines 31, 36, 41.

- [ ] **Step 2: Run require-auth tests**

Run: `bun test src/shared/middleware/require-auth.test.ts`
Expected: all tests pass.

- [ ] **Step 3: Update logout.test.ts**

Currently tests logout flow with refresh tokens and JWT signing. Rewrite:

```typescript
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { users } from '../../shared/db/schema';
import { getRedis } from '../../shared/lib/redis';
import { createTestToken } from '../../shared/testing/utils';

let app: any;

function req(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.handle(r).then(async (res: Response) => {
    let data: any;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  });
}

beforeAll(async () => {
  app = createApp();
});

beforeEach(async () => {
  await db.delete(users);
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys('ratelimit:*');
      if (keys.length > 0) await redis.del(...keys);
    } catch { /* best-effort */ }
  }
});

afterAll(async () => {
  await db.delete(users);
  resetDb();
});

describe('POST /api/auth/logout', () => {
  const db = getDb();

  test('returns 401 without auth', async () => {
    const { status } = await req('POST', '/api/auth/logout');
    expect(status).toBe(401);
  });

  test('returns success with valid auth', async () => {
    const [user] = await db
      .insert(users)
      .values({ phone: '+1234567890', role: 'driver' })
      .returning();
    const token = createTestToken(user.id);

    const { status, data } = await req('POST', '/api/auth/logout', undefined, token);
    expect(status).toBe(200);
    expect(data.message).toBe('Logged out successfully');
  });
});
```

- [ ] **Step 4: Run logout tests**

Run: `bun test src/features/auth/logout.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/shared/middleware/require-auth.test.ts apps/backend/src/features/auth/logout.test.ts
git commit -S -m "test: update require-auth and logout tests for Supabase auth"
```

---

### Task 13: Update feature test files (batch — identical pattern)

**Files (all pattern: remove JWT_SECRET, remove password_hash, remove refreshTokens, update createTestToken):**
- `apps/backend/src/features/onboarding/onboarding.test.ts`
- `apps/backend/src/features/kyc/kyc.test.ts`
- `apps/backend/src/features/drivers/drivers.test.ts`
- `apps/backend/src/features/trips/trips.test.ts`
- `apps/backend/src/features/trips/trips.race.test.ts`
- `apps/backend/src/features/payments/payments.test.ts`
- `apps/backend/src/features/earnings/earnings.test.ts`
- `apps/backend/src/features/ratings/ratings.test.ts`
- `apps/backend/src/features/sos/sos.test.ts`
- `apps/backend/src/features/location/location.test.ts`
- `apps/backend/src/features/notifications/notifications.test.ts`
- `apps/backend/src/features/maps/maps.test.ts`
- `apps/backend/src/features/payment-methods/payment-methods.test.ts`
- `apps/backend/src/features/districts/districts.test.ts`
- `apps/backend/src/features/admin/admin.test.ts`

- [ ] **Step 1: For each test file, apply the standard transformation**

For every test file, do these 4 changes:

**a) Remove `process.env.JWT_SECRET` line** (line 3 in most files):
```typescript
// DELETE this line:
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';
```

**b) Update imports** — remove `refreshTokens`:
```typescript
// BEFORE:
import { driverDocuments, drivers, refreshTokens, users, vehicles } from '../../shared/db/schema';
// AFTER:
import { driverDocuments, drivers, users, vehicles } from '../../shared/db/schema';
```

**c) Update `registerAndGetToken` helper** — remove `password_hash: 'unused'` and fix `createTestToken` call:
```typescript
// BEFORE:
async function registerAndGetToken(phone: string, _password: string): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver', password_hash: 'unused' })
    .returning({ id: users.id });
  return createTestToken(user.id, 'driver');
}
// AFTER:
async function registerAndGetToken(phone: string): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });
  return createTestToken(user.id);
}
```

Also update `registerAndGetTokenAndUser` (if present) — same pattern, remove `password_hash` and `_password` param.

**d) Update `truncateTables` / `beforeEach`** — remove `await db.delete(refreshTokens)`:
```typescript
// DELETE this line:
await db.delete(refreshTokens);
```

- [ ] **Step 2: Run all tests**

Run: `bun test`
Expected: all 206+ tests pass with 0 failures.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/features/*/
git commit -S -m "test: migrate all feature tests to Supabase auth pattern"
```

---

### Task 14: Update WebSocket location handler

**Files:**
- Modify: `apps/backend/src/features/location/routes.ts`

- [ ] **Step 1: Update the `open` handler to use supabase.getUser instead of verifyAccess**

In `apps/backend/src/features/location/routes.ts`, update the `open` function:

Remove:
```typescript
import { verifyAccess } from '../../shared/lib/jwt';
```

Add:
```typescript
import { getSupabaseClient } from '../../shared/lib/supabase';
import { db } from '../../shared/db/client';
import { users } from '../../shared/db/schema';
```

Replace the body of `open` (~lines 9-42) where it calls `verifyAccess`:

```typescript
async open(ws) {
  let resolveReady: (driverId: string | null) => void;
  (ws.data as any).ready = new Promise<string | null>((resolve) => {
    resolveReady = resolve;
  });

  const token = ws.data.query?.token;
  if (!token) {
    ws.close(4001, 'Unauthorized');
    resolveReady!(null);
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    ws.close(4001, 'Unauthorized');
    resolveReady!(null);
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    ws.close(4001, 'Unauthorized');
    resolveReady!(null);
    return;
  }

  (ws.data as any).userId = data.user.id;

  const driverId = await getDriverIdByUserId(data.user.id).catch(() => null);
  if (!driverId) {
    ws.close(4001, 'No driver profile');
    resolveReady!(null);
    return;
  }

  (ws.data as any).driverId = driverId;
  resolveReady!(driverId);
},
```

- [ ] **Step 2: Verify typecheck**

Run: `bun --filter @lifty/backend run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/features/location/routes.ts
git commit -S -m "refactor: update WS location open handler to use supabase.getUser"
```

---

### Task 15: Config files — env, docker-compose, turbo.json, ci.yml

**Files:**
- Modify: `apps/backend/.env.example`
- Modify: `apps/backend/.env.production.example`
- Modify: `apps/backend/.env`
- Modify: `apps/backend/.env.enc.yml`
- Modify: `apps/backend/docker-compose.yml`
- Modify: `apps/mobile/.env`
- Modify: `apps/mobile/.env.example`
- Modify: `apps/mobile/.env.enc.yml`
- Modify: `turbo.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update backend .env.example**

Remove lines with:
```
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES=
JWT_REFRESH_EXPIRES=
SUPABASE_JWT_SECRET=
SUPABASE_SERVICE_KEY=
```

Add:
```
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

- [ ] **Step 2: Update backend .env.production.example**

Same removals as .env.example, plus remove:
```
BCRYPT_COST=12
```

- [ ] **Step 3: Update backend .env**

Remove `JWT_SECRET`, `SUPABASE_SERVICE_KEY`. Replace `SUPABASE_SERVICE_KEY` value with `SUPABASE_SECRET_KEY` value. Add `SUPABASE_PUBLISHABLE_KEY`.

- [ ] **Step 4: Update backend .env.enc.yml**

Re-encrypt with the new keys using sops:
```bash
sops --encrypt apps/backend/.env > apps/backend/.env.enc.yml
```

- [ ] **Step 5: Update docker-compose.yml**

In the `environment` block for the backend service:

Remove:
```yaml
JWT_SECRET: ${JWT_SECRET}
JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
```

Add (if not present):
```yaml
SUPABASE_URL: ${SUPABASE_URL}
SUPABASE_PUBLISHABLE_KEY: ${SUPABASE_PUBLISHABLE_KEY}
SUPABASE_SECRET_KEY: ${SUPABASE_SECRET_KEY}
```

- [ ] **Step 6: Update mobile .env**

Change:
```
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```
to:
```
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Apply the same change to `mobile/.env.example` and `mobile/.env.enc.yml`.

- [ ] **Step 7: Update turbo.json**

In the `test` task, remove `JWT_SECRET` from the `env` array (line 16):
```json
{
  "tasks": {
    "test": {
      "env": [
        "DATABASE_URL",
        "TEST_DATABASE_URL",
        "REDIS_URL",
        "RATE_LIMIT_MAX"
      ]
    }
  }
}
```

- [ ] **Step 8: Update ci.yml**

Remove line ~85:
```yaml
JWT_SECRET: test-jwt-secret-at-least-32-chars!!
```

- [ ] **Step 9: Commit**

```bash
git add apps/backend/.env.example apps/backend/.env.production.example apps/backend/.env apps/backend/.env.enc.yml apps/backend/docker-compose.yml apps/mobile/.env apps/mobile/.env.example apps/mobile/.env.enc.yml turbo.json .github/workflows/ci.yml
git commit -S -m "chore: migrate env vars to new Supabase publishable/secret keys"
```

---

### Task 16: Update storage.ts to use new secret key

**Files:**
- Modify: `apps/backend/src/shared/lib/storage.ts`

- [ ] **Step 1: Change the key env var**

Line 9: change from:
```typescript
const key = process.env.SUPABASE_SERVICE_KEY;
```
to:
```typescript
const key = process.env.SUPABASE_SECRET_KEY;
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/shared/lib/storage.ts
git commit -S -m "refactor: migrate storage to SUPABASE_SECRET_KEY"
```

---

### Task 17: Update scripts (dev-setup, generate-secrets)

**Files:**
- Modify: `apps/backend/scripts/dev-setup.ts`
- Modify: `apps/backend/scripts/generate-secrets.ts`

- [ ] **Step 1: Update dev-setup.ts**

Remove the `JWT_SECRET` generation block (~lines 58-66). Replace it with template for new keys:

```typescript
if (!existsSync(envPath)) {
  const content = [
    'DATABASE_URL=',
    'RESEND_API_KEY=',
    'SUPABASE_URL=',
    'SUPABASE_PUBLISHABLE_KEY=sb_publishable_...',
    'SUPABASE_SECRET_KEY=sb_secret_...',
    'REDIS_URL=redis://localhost:6379',
    'PORT=3000',
    'RATE_LIMIT_MAX=100',
  ].join('\n') + '\n';
  writeFileSync(envPath, content);
  console.log('Created apps/backend/.env');
}
```

- [ ] **Step 2: Update generate-secrets.ts**

Remove:
```typescript
console.log(`JWT_SECRET=${hex(crypto.getRandomValues(new Uint8Array(32)))}`);
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/scripts/dev-setup.ts apps/backend/scripts/generate-secrets.ts
git commit -S -m "chore: remove JWT secret generation from dev scripts"
```

---

### Task 18: Update docs (AGENTS.md, README.md, Decisiones.md)

**Files:**
- Modify: `apps/backend/AGENTS.md`
- Modify: `apps/backend/README.md`
- Modify: `docs/vault/01 - PROYECTO/Decisiones.md`

- [ ] **Step 1: Update backend/AGENTS.md**

Replace the `## Auth` section:

Remove lines referencing:
- `POST /auth/register`, `/auth/verify`, `/auth/login`, `/auth/refresh`
- `Variables requeridas: JWT_SECRET (min 32 chars)`

Replace with:
```markdown
## Auth
- Auth via Supabase Auth. El backend verifica tokens con `supabase.auth.getUser()`.
- `GET /auth/me` — perfil del usuario autenticado
- `POST /auth/logout` — cierre de sesion (no-op, Supabase maneja la sesion)
- Variables requeridas: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, `RESEND_API_KEY`
```

Also update the stale `docs/vault/03 - REFERENCIAS/affected-files.md` reference if needed.

- [ ] **Step 2: Update backend/README.md**

Remove `JWT_SECRET` from the env vars table (line 44).

Remove `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` row (line 54).

Add new row:
```
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (sb_publishable_...) | Auth — verificación de tokens de usuario. |
```

Keep `SUPABASE_SECRET_KEY` alongside storage.

- [ ] **Step 3: Update Decisiones.md**

Change line 11 from:
```
| Auth | JWT propio (migrando a Supabase Auth) | Eliminar dualidad frontend/backend |
```
to:
```
| Auth | Supabase Auth SDK | Verificación via supabase.auth.getUser() |
```

Remove line 27 (tech debt item 4 about auth migration):
```
4. **Auth migration**: Completar migración a Supabase Auth como single source of truth
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/AGENTS.md apps/backend/README.md docs/vault/01\ -\ PROYECTO/Decisiones.md
git commit -S -m "docs: update auth documentation for Supabase-only"
```

---

### Task 19: Final verification

- [ ] **Step 1: Run typecheck**

```bash
bun run typecheck
```
Expected: no errors in both backend and mobile.

- [ ] **Step 2: Run lint**

```bash
bun run lint
```
Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
bun run test
```
Expected: all tests pass with 0 failures.

- [ ] **Step 4: Cleanup — verify no stale references**

```bash
grep -r "JWT_SECRET" apps/backend/src/ --include="*.ts" | grep -v node_modules | grep -v '.test.ts'
```
Expected: no results (JWT_SECRET should not appear in source, only possibly in env files).

```bash
grep -r "signAccess\|signRefresh\|verifyAccess\|hashPassword\|refreshTokens" apps/backend/src/ --include="*.ts" | grep -v node_modules
```
Expected: no results.

```bash
grep -r "password_hash" apps/backend/src/ --include="*.ts" | grep -v node_modules | grep -v migrations
```
Expected: no results (may appear in migration SQL files, that's fine).

- [ ] **Step 5: Manual smoke test**

Start the backend and verify:
- `GET /health` returns 200
- `GET /api/auth/me` with no token returns 401
- `GET /api/auth/me` with a valid Supabase JWT returns user data

- [ ] **Step 6: Final commit (if any cleanup)**

```bash
git add -A && git diff --cached --stat
```
Review and commit any remaining cleanup.
