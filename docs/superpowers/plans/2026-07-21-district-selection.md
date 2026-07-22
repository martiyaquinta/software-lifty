# District Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow approved drivers to select a province and municipality where they'll operate. Each municipality has its own terms & conditions that must be accepted. Selection is permanent.

**Architecture:** Backend adds `terms_and_conditions`/`privacy_policy` columns to `districts`, a `district_id` FK on `drivers`, and 4 new/modified endpoints. Mobile adds 3 new screens (SelectProvince, SelectDistrict, DistrictTerms) and adjusts post-auth routing so approved drivers without a district are routed to selection instead of Online.

**Tech Stack:** Bun + Elysia + Drizzle (backend), Expo SDK 56 + React 19 + TypeScript 6.0 (mobile)

**Spec:** `docs/superpowers/specs/2026-07-21-district-selection-design.md`

## Global Constraints

- Backend: Elysia routes use `safeCall` wrapper, schemas in `features/<name>/schema.ts`, Drizzle schemas in `shared/db/schema/`
- Backend: Migrations via Supabase CLI (`supabase migration new`)
- Mobile: expo-router file-based routing, screen components in `src/screens/`, re-exported from `app/`
- Mobile: Theme from `src/theme/index.ts`, `StyleSheet.create()` at bottom of each file
- Mobile: Named exports only, no default exports in components/screens
- No emojis in UI unless already used in existing patterns
- Test: Backend uses `bun:test` co-located with feature files

---

### Task 1: DB Migration — Add columns and seed data

**Files:**
- Create: `apps/backend/supabase/migrations/20260721_district_terms_and_driver_district.sql`
- Create: `apps/backend/supabase/migrations/20260721_seed_villa_dolores_terms.sql`

**Interfaces:**
- Produces: `districts.terms_and_conditions` (text, nullable), `districts.privacy_policy` (text, nullable), `drivers.district_id` (uuid FK → districts.id, nullable)

- [ ] **Step 1: Create migration for schema changes**

```bash
mkdir -p apps/backend/supabase/migrations
```

Write `apps/backend/supabase/migrations/20260721_district_terms_and_driver_district.sql`:

```sql
ALTER TABLE districts ADD COLUMN IF NOT EXISTS terms_and_conditions text;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS privacy_policy text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES districts(id);
```

- [ ] **Step 2: Create migration for Villa Dolores seed data**

Write `apps/backend/supabase/migrations/20260721_seed_villa_dolores_terms.sql`:

```sql
UPDATE districts
SET terms_and_conditions = '<h2>Términos y Condiciones — Villa Dolores</h2><p>Al operar como conductor en Villa Dolores, aceptás cumplir con las normativas municipales de transporte, mantener tu vehículo en condiciones óptimas, y respetar las tarifas establecidas por la plataforma Lifty. El incumplimiento de estas condiciones puede resultar en la suspensión de tu cuenta.</p>',
    privacy_policy = '<h2>Política de Privacidad — Villa Dolores</h2><p>Tus datos personales y ubicación serán tratados conforme a la Ley 25.326 de Protección de Datos Personales. La información de tus viajes se comparte solo con fines operativos y de facturación. No compartimos tus datos con terceros sin tu consentimiento explícito.</p>'
WHERE name = 'Villa Dolores';
```

- [ ] **Step 3: Push migrations to Supabase**

```bash
supabase db push
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/supabase/migrations/20260721_district_terms_and_driver_district.sql apps/backend/supabase/migrations/20260721_seed_villa_dolores_terms.sql
git commit -m "feat: add district terms columns and driver-district FK migration"
```

---

### Task 2: Backend — Update Drizzle schemas

**Files:**
- Modify: `apps/backend/src/shared/db/schema/districts.ts`
- Modify: `apps/backend/src/shared/db/schema/drivers.ts`

**Interfaces:**
- Produces: `districts.terms_and_conditions`, `districts.privacy_policy` (text columns in Drizzle), `drivers.district_id` (uuid FK)

- [ ] **Step 1: Update districts Drizzle schema**

Edit `apps/backend/src/shared/db/schema/districts.ts` — replace the file content:

```typescript
import { pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';

export const districts = pgTable('districts', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  province: varchar('province', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  terms_and_conditions: text('terms_and_conditions'),
  privacy_policy: text('privacy_policy'),
});
```

- [ ] **Step 2: Update drivers Drizzle schema**

Edit `apps/backend/src/shared/db/schema/drivers.ts` — add `district_id` to the `drivers` table and import `districts`:

Change the import line to add `uuid` destructured import from drizzle-orm/pg-core (already imported). Add the `district_id` column after `admin_review_notes`:

Locate the `admin_review_notes: text('admin_review_notes'),` line and add after it:

```typescript
  district_id: uuid('district_id').references(() => districts.id),
```

Also add `import { districts } from './districts';` at the top of the file after the `users` import.

- [ ] **Step 3: Verify typecheck**

```bash
bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/shared/db/schema/districts.ts apps/backend/src/shared/db/schema/drivers.ts
git commit -m "feat: add district terms and driver district_id to Drizzle schemas"
```

---

### Task 3: Backend — Update districts endpoints (provinces, filter, detail)

**Files:**
- Modify: `apps/backend/src/features/districts/schema.ts`
- Modify: `apps/backend/src/features/districts/service.ts`
- Modify: `apps/backend/src/features/districts/routes.ts`

**Interfaces:**
- Produces: `GET /api/districts/provinces` → `{ provinces: string[] }`
- Produces: `GET /api/districts?province=X` → filtered list
- Produces: `GET /api/districts/:id` → district detail with terms

- [ ] **Step 1: Update Elysia validation schemas**

Edit `apps/backend/src/features/districts/schema.ts` — replace the file content:

```typescript
import { t } from 'elysia';

export const provinceQuery = t.Object({
  province: t.Optional(t.String()),
});

export const districtParams = t.Object({
  id: t.String(),
});

export const provincesResponse = t.Object({
  provinces: t.Array(t.String()),
});

export const districtItem = t.Object({
  id: t.String(),
  name: t.String(),
  province: t.String(),
});

export const districtsListResponse = t.Object({
  districts: t.Array(districtItem),
});

export const districtDetailResponse = t.Object({
  id: t.String(),
  name: t.String(),
  province: t.String(),
  status: t.String(),
  terms_and_conditions: t.Nullable(t.String()),
  privacy_policy: t.Nullable(t.String()),
});
```

- [ ] **Step 2: Update districts service**

Edit `apps/backend/src/features/districts/service.ts` — replace the file content:

```typescript
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { districts } from '../../shared/db/schema';
import { NotFoundError } from '../../shared/lib/errors';

type DistrictRow = {
  id: string;
  name: string;
  province: string;
  status: string;
  terms_and_conditions: string | null;
  privacy_policy: string | null;
};

function filterSelectable(rows: DistrictRow[]) {
  return rows
    .filter((r) => r.terms_and_conditions !== null)
    .map(({ terms_and_conditions: _, privacy_policy: _p, ...rest }) => rest);
}

export const districtsService = {
  async getActive(province?: string) {
    const conditions = [eq(districts.status, 'active'), isNotNull(districts.terms_and_conditions)];
    if (province) conditions.push(eq(districts.province, province));

    const rows = await db
      .select({
        id: districts.id,
        name: districts.name,
        province: districts.province,
        status: districts.status,
        terms_and_conditions: districts.terms_and_conditions,
        privacy_policy: districts.privacy_policy,
      })
      .from(districts)
      .where(and(...conditions))
      .orderBy(districts.name);

    return { districts: filterSelectable(rows) };
  },

  async getProvinces() {
    const rows = await db
      .select({ province: districts.province })
      .from(districts)
      .where(and(eq(districts.status, 'active'), isNotNull(districts.terms_and_conditions)))
      .orderBy(districts.province);

    const seen = new Set<string>();
    const provinces: string[] = [];
    for (const r of rows) {
      if (!seen.has(r.province)) {
        seen.add(r.province);
        provinces.push(r.province);
      }
    }
    return { provinces };
  },

  async getById(id: string) {
    const rows = await db
      .select({
        id: districts.id,
        name: districts.name,
        province: districts.province,
        status: districts.status,
        terms_and_conditions: districts.terms_and_conditions,
        privacy_policy: districts.privacy_policy,
      })
      .from(districts)
      .where(eq(districts.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) throw new NotFoundError('District not found');
    return row;
  },
};
```

- [ ] **Step 3: Update districts routes**

Edit `apps/backend/src/features/districts/routes.ts` — replace the file content:

```typescript
import { Elysia } from 'elysia';
import { authGuard } from '../../shared/middleware/require-auth';
import { districtsService } from './service';
import { districtDetailResponse, districtParams, districtsListResponse, provinceQuery, provincesResponse } from './schema';

import { safeCall } from '../../shared/lib/route-utils';

export const districtsRoutes = new Elysia({ prefix: '/districts' })
  .use(authGuard)
  .get(
    '/',
    ({ query, set }) => safeCall(() => districtsService.getActive(query.province), set),
    { query: provinceQuery, requireAuth: true },
  )
  .get(
    '/provinces',
    ({ set }) => safeCall(() => districtsService.getProvinces(), set),
    { requireAuth: true, response: provincesResponse },
  )
  .get(
    '/:id',
    ({ params, set }) => safeCall(() => districtsService.getById(params.id), set),
    { params: districtParams, requireAuth: true, response: districtDetailResponse },
  );
```

- [ ] **Step 4: Verify typecheck**

```bash
bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/districts/
git commit -m "feat: add provinces, filter, and detail endpoints to districts"
```

---

### Task 4: Backend — Add set-district endpoint to drivers

**Files:**
- Modify: `apps/backend/src/features/drivers/schema.ts`
- Modify: `apps/backend/src/features/drivers/service.ts`
- Modify: `apps/backend/src/features/drivers/routes.ts`

**Interfaces:**
- Produces: `PUT /api/drivers/me/district` → `{ district_id, district_name, district_province }`
- Produces: `GET /api/drivers/me/status` → now includes `has_district` and optional `district`

- [ ] **Step 1: Add set-district body schema**

Edit `apps/backend/src/features/drivers/schema.ts`, add at the end:

```typescript
export const setDistrictBody = t.Object({
  district_id: t.String(),
});
```

- [ ] **Step 2: Add setDistrict method and update getMyStatus**

Edit `apps/backend/src/features/drivers/service.ts`:

Add import at top:
```typescript
import { districts } from '../../shared/db/schema';
```

Add these two methods inside `driversService` object, before the closing `};`:

```typescript
  async setDistrict(user: AuthUser, districtId: string) {
    const [driver] = await db
      .select({
        id: drivers.id,
        status: drivers.status,
        district_id: drivers.district_id,
      })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver profile not found');
    if (driver.status !== 'approved') {
      throw new AppError('Debes estar aprobado para elegir un municipio', 400, 'NOT_APPROVED');
    }
    if (driver.district_id) {
      throw new AppError('Ya tenes un municipio asignado y no se puede cambiar', 409, 'DISTRICT_ALREADY_SET');
    }

    const [district] = await db
      .select({ id: districts.id, name: districts.name, province: districts.province, terms_and_conditions: districts.terms_and_conditions })
      .from(districts)
      .where(and(eq(districts.id, districtId), eq(districts.status, 'active')))
      .limit(1);

    if (!district || !district.terms_and_conditions) {
      throw new AppError('Municipio no encontrado o no disponible', 404, 'DISTRICT_NOT_FOUND');
    }

    await db
      .update(drivers)
      .set({ district_id: districtId, updated_at: new Date() })
      .where(eq(drivers.id, driver.id));

    return {
      district_id: district.id,
      district_name: district.name,
      district_province: district.province,
    };
  },

  async getMyDistrict(user: AuthUser): Promise<{ id: string; name: string; province: string } | null> {
    const [driver] = await db
      .select({ district_id: drivers.district_id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);

    if (!driver?.district_id) return null;

    const [district] = await db
      .select({ id: districts.id, name: districts.name, province: districts.province })
      .from(districts)
      .where(eq(districts.id, driver.district_id))
      .limit(1);

    return district ?? null;
  },
```

Update `getMyStatus` method — find this section in the same file:

```typescript
    if (driver.status === 'approved') {
      return {
        status: 'approved',
        step: 'approved',
        documents_pending_review: documentsPendingReview,
      };
    }
```

Replace it with:

```typescript
    if (driver.status === 'approved') {
      const district = await this.getMyDistrict(user);
      return {
        status: 'approved',
        step: 'approved',
        documents_pending_review: documentsPendingReview,
        has_district: !!district,
        district: district ?? undefined,
      };
    }
```

- [ ] **Step 3: Add route for set-district**

Edit `apps/backend/src/features/drivers/routes.ts`:

Add `setDistrictBody` to the imports from './schema':
```typescript
import {
  addDocumentBody,
  driverIdParams,
  reuploadDocBody,
  setDistrictBody,
  toggleOnlineBody,
  updateProfileBody,
  uploadPhotoBody,
} from './schema';
```

Add the new route before the closing of the `driversRoutes` chain (after the `/me/photo` route):

```typescript
  .put(
    '/me/district',
    ({ user, body, set }) => safeCall(() => driversService.setDistrict(user, body.district_id), set),
    { body: setDistrictBody, requireAuth: true },
  );
```

- [ ] **Step 4: Verify typecheck**

```bash
bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/drivers/
git commit -m "feat: add set-district endpoint and district info to driver status"
```

---

### Task 5: Backend — Tests for districts and drivers

**Files:**
- Modify: `apps/backend/src/features/districts/districts.test.ts`
- Create: `apps/backend/src/features/drivers/district.test.ts`

- [ ] **Step 1: Update districts tests to cover new endpoints**

Edit `apps/backend/src/features/districts/districts.test.ts` — replace the file content:

```typescript
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { users } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';
let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(users);
}

async function request(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await app.handle(req);
  const data = await res.json();
  return { status: res.status, data };
}

async function registerAndGetToken(phone: string, _password: string): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });
  return createTestToken(user.id);
}

beforeAll(async () => {
  app = createApp();
  const db = getDb();
  const existing: any = await db.execute('SELECT count(*) AS count FROM districts WHERE terms_and_conditions IS NOT NULL');
  if (Number(existing.rows[0]?.count ?? 0) === 0) {
    await db.execute(`
      INSERT INTO "districts" (name, province, status, terms_and_conditions, privacy_policy) VALUES
        ('Villa Dolores', 'Córdoba', 'active', 'Terms here', 'Privacy here'),
        ('Mina Clavero', 'Córdoba', 'active', 'Terms here', 'Privacy here')
      ON CONFLICT DO NOTHING
    `);
    await db.execute(`
      INSERT INTO "districts" (name, province, status) VALUES
        ('Sin Terminos', 'Córdoba', 'active')
      ON CONFLICT DO NOTHING
    `);
  }
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Districts', () => {
  const phone = '+5492615555555';
  const password = 'testPass123';

  test('GET /districts returns active districts with terms', async () => {
    const token = await registerAndGetToken(phone, password);
    const { status, data } = await request('GET', '/api/districts', undefined, token);

    expect(status).toBe(200);
    expect(data.districts).toBeArray();
    expect(data.districts.length).toBeGreaterThanOrEqual(1);

    for (const d of data.districts) {
      expect(d.id).toBeString();
      expect(d.name).toBeString();
      expect(d.province).toBeString();
    }

    const names = data.districts.map((d: any) => d.name);
    expect(names).toContain('Villa Dolores');
    expect(names).toContain('Mina Clavero');
    // 'Sin Terminos' should NOT appear (no terms_and_conditions)
    expect(names).not.toContain('Sin Terminos');
  });

  test('GET /districts?province=Córdoba filters by province', async () => {
    const token = await registerAndGetToken(phone, password);
    const { status, data } = await request('GET', '/api/districts?province=Córdoba', undefined, token);

    expect(status).toBe(200);
    for (const d of data.districts) {
      expect(d.province).toBe('Córdoba');
    }
  });

  test('GET /districts?province=SanLuis returns empty', async () => {
    const token = await registerAndGetToken(phone, password);
    const { status, data } = await request('GET', '/api/districts?province=SanLuis', undefined, token);

    expect(status).toBe(200);
    expect(data.districts).toEqual([]);
  });

  test('GET /districts/provinces returns unique provinces', async () => {
    const token = await registerAndGetToken(phone, password);
    const { status, data } = await request('GET', '/api/districts/provinces', undefined, token);

    expect(status).toBe(200);
    expect(data.provinces).toBeArray();
    expect(data.provinces).toContain('Córdoba');
  });

  test('GET /districts/:id returns detail with terms', async () => {
    const token = await registerAndGetToken(phone, password);
    // Get a known district id first
    const listRes = await request('GET', '/api/districts', undefined, token);
    const firstId = listRes.data.districts[0].id;

    const { status, data } = await request('GET', `/api/districts/${firstId}`, undefined, token);

    expect(status).toBe(200);
    expect(data.id).toBe(firstId);
    expect(data.terms_and_conditions).toBeString();
    expect(data.privacy_policy).toBeString();
  });

  test('GET /districts/:nonexistent returns 404', async () => {
    const token = await registerAndGetToken(phone, password);
    const { status } = await request('GET', '/api/districts/00000000-0000-0000-0000-000000000000', undefined, token);

    expect(status).toBe(404);
  });

  test('GET /districts without auth returns 401', async () => {
    const { status, data } = await request('GET', '/api/districts');

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
});
```

- [ ] **Step 2: Run districts tests**

```bash
cd apps/backend && bun test src/features/districts/districts.test.ts
```

- [ ] **Step 3: Create driver district tests**

Write `apps/backend/src/features/drivers/district.test.ts`:

```typescript
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { districts as districtsTable, drivers as driversTable, users } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';
let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(users);
}

async function request(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await app.handle(req);
  const data = await res.json();
  return { status: res.status, data };
}

let districtId: string;

beforeAll(async () => {
  app = createApp();
  const db = getDb();

  const existing: any = await db.execute('SELECT count(*) AS count FROM districts WHERE terms_and_conditions IS NOT NULL');
  if (Number(existing.rows[0]?.count ?? 0) === 0) {
    const [d] = await db
      .insert(districtsTable)
      .values({
        name: 'Villa Dolores',
        province: 'Córdoba',
        status: 'active',
        terms_and_conditions: 'Terms here',
        privacy_policy: 'Privacy here',
      })
      .returning({ id: districtsTable.id });
    districtId = d.id;
  } else {
    const [d] = await db
      .select({ id: districtsTable.id })
      .from(districtsTable)
      .where(eq(districtsTable.name, 'Villa Dolores'))
      .limit(1);
    districtId = d.id;
  }
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

async function setupApprovedDriver(phone: string): Promise<{ token: string; driverId: string }> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });

  const token = createTestToken(user.id);

  const [driver] = await db
    .insert(driversTable)
    .values({ user_id: user.id, status: 'approved' })
    .returning({ id: driversTable.id });

  return { token, driverId: driver.id };
}

describe('Driver District', () => {
  test('PUT /drivers/me/district sets district for approved driver', async () => {
    const { token } = await setupApprovedDriver('+5492611111111');

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/district',
      { district_id: districtId },
      token,
    );

    expect(status).toBe(200);
    expect(data.district_id).toBe(districtId);
    expect(data.district_name).toBe('Villa Dolores');
    expect(data.district_province).toBe('Córdoba');
  });

  test('PUT /drivers/me/district with invalid id returns 404', async () => {
    const { token } = await setupApprovedDriver('+5492612222222');

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/district',
      { district_id: '00000000-0000-0000-0000-000000000000' },
      token,
    );

    expect(status).toBe(404);
    expect(data.error.code).toBe('DISTRICT_NOT_FOUND');
  });

  test('PUT /drivers/me/district twice returns 409', async () => {
    const { token } = await setupApprovedDriver('+5492613333333');

    await request('PUT', '/api/drivers/me/district', { district_id: districtId }, token);
    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/district',
      { district_id: districtId },
      token,
    );

    expect(status).toBe(409);
    expect(data.error.code).toBe('DISTRICT_ALREADY_SET');
  });

  test('GET /drivers/me/status returns has_district after set', async () => {
    const { token } = await setupApprovedDriver('+5492614444444');

    await request('PUT', '/api/drivers/me/district', { district_id: districtId }, token);
    const { status, data } = await request('GET', '/api/drivers/me/status', undefined, token);

    expect(status).toBe(200);
    expect(data.has_district).toBe(true);
    expect(data.district.name).toBe('Villa Dolores');
  });

  test('GET /drivers/me/status returns has_district false before set', async () => {
    const { token } = await setupApprovedDriver('+5492615555555');

    const { status, data } = await request('GET', '/api/drivers/me/status', undefined, token);

    expect(status).toBe(200);
    expect(data.has_district).toBe(false);
    expect(data.district).toBeUndefined();
  });

  test('PUT /drivers/me/district without auth returns 401', async () => {
    const { status } = await request('PUT', '/api/drivers/me/district', { district_id: districtId });

    expect(status).toBe(401);
  });
});
```

- [ ] **Step 4: Run driver district tests**

```bash
cd apps/backend && bun test src/features/drivers/district.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/districts/districts.test.ts apps/backend/src/features/drivers/district.test.ts
git commit -m "test: add district endpoints and driver district tests"
```

---

### Task 6: Mobile — Add types and API types

**Files:**
- Modify: `apps/mobile/src/api/types.ts`

- [ ] **Step 1: Add district schemas and update driverStatusSchema**

Edit `apps/mobile/src/api/types.ts`:

Add after the existing `driverStatusSchema` definition:

```typescript
export const districtSchema = z.object({
  id: z.string(),
  name: z.string(),
  province: z.string(),
});

export const districtDetailSchema = districtSchema.extend({
  terms_and_conditions: z.string().nullable(),
  privacy_policy: z.string().nullable(),
});
```

Update `driverStatusSchema` — replace the last line before `});`:

Find:
```typescript
  admin_review_notes: z.string().nullable().optional(),
});
```

Replace with:
```typescript
  admin_review_notes: z.string().nullable().optional(),
  has_district: z.boolean().optional(),
  district: z
    .object({
      id: z.string(),
      name: z.string(),
      province: z.string(),
    })
    .optional(),
});
```

Add type exports at the bottom of the file after the existing `DriverDocument` type:

```typescript
export type District = z.infer<typeof districtSchema>;
export type DistrictDetail = z.infer<typeof districtDetailSchema>;
```

- [ ] **Step 2: Run typecheck on mobile**

```bash
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/api/types.ts
git commit -m "feat: add district and district detail types for mobile"
```

---

### Task 7: Mobile — Update postAuthRouting for district step

**Files:**
- Modify: `apps/mobile/src/lib/postAuthRouting.ts`

- [ ] **Step 1: Add district routing logic**

Edit `apps/mobile/src/lib/postAuthRouting.ts`:

Add `SelectProvince` to the `ScreenName` union import. The import already uses `ScreenName` from the hook, so when we add it there it'll be available.

Replace the `routeForDriverStatus` function with:

```typescript
export function routeForDriverStatus(driverData: DriverStatus): {
  screen: ScreenName | '';
  status: DriverStatusValue;
  blockedMessage?: string;
} {
  const { status, step, has_district } = driverData;

  if (status === 'rejected') {
    return {
      screen: '',
      status,
      blockedMessage: 'Tu cuenta ha sido rechazada. Contacta a soporte.',
    };
  }
  if (status === 'suspended') {
    return { screen: '', status, blockedMessage: 'Tu cuenta ha sido suspendida.' };
  }

  const byStep = step ? STEP_ROUTE[step] : undefined;
  if (byStep) {
    // Approved drivers without a district go to district selection first
    if (step === 'approved' && !has_district) {
      return { screen: 'SelectProvince', status: 'approved' };
    }
    return { screen: byStep.screen, status: byStep.storeStatus };
  }

  if (status === 'approved') {
    if (!has_district) return { screen: 'SelectProvince', status: 'approved' };
    return { screen: 'Online', status: 'approved' };
  }
  if (status === 'under_review') return { screen: 'WaitingApproval', status: 'under_review' };

  return { screen: 'OnboardingStep1', status: 'pending' };
}
```

- [ ] **Step 2: Run typecheck on mobile**

```bash
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/lib/postAuthRouting.ts
git commit -m "feat: route approved drivers without district to province selection"
```

---

### Task 8: Mobile — Add navigation mappings and route files

**Files:**
- Modify: `apps/mobile/src/hooks/useAppNavigation.ts`
- Create: `apps/mobile/app/select-province.tsx`
- Create: `apps/mobile/app/select-district.tsx`
- Create: `apps/mobile/app/district-terms.tsx`

- [ ] **Step 1: Add screen-to-route mappings**

Edit `apps/mobile/src/hooks/useAppNavigation.ts`:

Add to `SCREEN_TO_ROUTE`:
```typescript
  SelectProvince: '/select-province',
  SelectDistrict: '/select-district',
  DistrictTerms: '/district-terms',
```

Add to `BACK_FALLBACK`:
```typescript
  'select-district': 'SelectProvince',
  'district-terms': 'SelectDistrict',
```

- [ ] **Step 2: Create route files**

Write `apps/mobile/app/select-province.tsx`:
```typescript
export { SelectProvinceScreen as default } from '../src/screens/SelectProvinceScreen';
```

Write `apps/mobile/app/select-district.tsx`:
```typescript
export { SelectDistrictScreen as default } from '../src/screens/SelectDistrictScreen';
```

Write `apps/mobile/app/district-terms.tsx`:
```typescript
export { DistrictTermsScreen as default } from '../src/screens/DistrictTermsScreen';
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/useAppNavigation.ts apps/mobile/app/select-province.tsx apps/mobile/app/select-district.tsx apps/mobile/app/district-terms.tsx
git commit -m "feat: add navigation mappings and route files for district selection"
```

---

### Task 9: Mobile — SelectProvinceScreen

**Files:**
- Create: `apps/mobile/src/screens/SelectProvinceScreen.tsx`

- [ ] **Step 1: Write the screen**

Write `apps/mobile/src/screens/SelectProvinceScreen.tsx`:

```typescript
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { Navbar } from '../components/Navbar';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export const SelectProvinceScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const [provinces, setProvinces] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProvinces = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: body } = await apiClient.get('/districts/provinces');
      const payload = body?.data ?? body;
      setProvinces(payload.provinces ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Error al cargar provincias');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProvinces();
  }, [fetchProvinces]);

  const handleSelect = (province: string) => {
    navigation.navigate('SelectDistrict', { province });
  };

  const renderItem = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => handleSelect(item)}
      activeOpacity={0.7}
    >
      <Text style={styles.itemText}>{item}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Navbar
        title="¿Dónde querés trabajar?"
        onBack={() => navigation.goBack()}
      />
      <View style={styles.content}>
        <Text style={styles.subtitle}>Seleccioná tu provincia</Text>
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.turquoise} style={styles.loader} />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchProvinces}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : provinces.length === 0 ? (
          <Text style={styles.emptyText}>No hay provincias disponibles</Text>
        ) : (
          <FlatList
            data={provinces}
            renderItem={renderItem}
            keyExtractor={(item) => item}
            contentContainerStyle={styles.list}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.white },
  content: { flex: 1, padding: theme.spacing.lg },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    marginBottom: theme.spacing.lg,
  },
  list: { gap: theme.spacing.sm },
  item: {
    backgroundColor: theme.colors.lightGray,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  itemText: {
    fontSize: theme.fontSize.lg,
    color: theme.colors.deepBlue,
  },
  loader: { marginTop: theme.spacing.xl },
  errorContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  errorText: { color: theme.colors.dangerRed, fontSize: theme.fontSize.md },
  retryText: { color: theme.colors.turquoise, fontSize: theme.fontSize.md, fontWeight: '500' },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.mediumGray,
    fontSize: theme.fontSize.md,
    marginTop: theme.spacing.xl,
  },
});
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/SelectProvinceScreen.tsx
git commit -m "feat: add SelectProvinceScreen for choosing province"
```

---

### Task 10: Mobile — SelectDistrictScreen

**Files:**
- Create: `apps/mobile/src/screens/SelectDistrictScreen.tsx`

- [ ] **Step 1: Write the screen**

Write `apps/mobile/src/screens/SelectDistrictScreen.tsx`:

```typescript
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import type { District } from '../api/types';
import { Navbar } from '../components/Navbar';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export const SelectDistrictScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const { province } = useLocalSearchParams<{ province: string }>();
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDistricts = useCallback(async () => {
    if (!province) return;
    try {
      setLoading(true);
      setError(null);
      const { data: body } = await apiClient.get('/districts', {
        params: { province },
      });
      const payload = body?.data ?? body;
      setDistricts(payload.districts ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Error al cargar municipios');
    } finally {
      setLoading(false);
    }
  }, [province]);

  useEffect(() => {
    fetchDistricts();
  }, [fetchDistricts]);

  const handleSelect = (district: District) => {
    navigation.navigate('DistrictTerms', {
      districtId: district.id,
      districtName: district.name,
    });
  };

  const renderItem = ({ item }: { item: District }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => handleSelect(item)}
      activeOpacity={0.7}
    >
      <Text style={styles.itemText}>{item.name}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Navbar
        title={`Municipios en ${province ?? ''}`}
        onBack={() => navigation.goBack()}
      />
      <View style={styles.content}>
        <Text style={styles.subtitle}>Seleccioná tu municipio</Text>
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.turquoise} style={styles.loader} />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchDistricts}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : districts.length === 0 ? (
          <Text style={styles.emptyText}>
            No hay municipios disponibles en {province}
          </Text>
        ) : (
          <FlatList
            data={districts}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.white },
  content: { flex: 1, padding: theme.spacing.lg },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    marginBottom: theme.spacing.lg,
  },
  list: { gap: theme.spacing.sm },
  item: {
    backgroundColor: theme.colors.lightGray,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  itemText: {
    fontSize: theme.fontSize.lg,
    color: theme.colors.deepBlue,
  },
  loader: { marginTop: theme.spacing.xl },
  errorContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  errorText: { color: theme.colors.dangerRed, fontSize: theme.fontSize.md },
  retryText: { color: theme.colors.turquoise, fontSize: theme.fontSize.md, fontWeight: '500' },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.mediumGray,
    fontSize: theme.fontSize.md,
    marginTop: theme.spacing.xl,
  },
});
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/SelectDistrictScreen.tsx
git commit -m "feat: add SelectDistrictScreen for choosing municipality"
```

---

### Task 11: Mobile — DistrictTermsScreen

**Files:**
- Create: `apps/mobile/src/screens/DistrictTermsScreen.tsx`

- [ ] **Step 1: Write the screen**

Write `apps/mobile/src/screens/DistrictTermsScreen.tsx`:

```typescript
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { Navbar } from '../components/Navbar';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export const DistrictTermsScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const { districtId, districtName } = useLocalSearchParams<{
    districtId: string;
    districtName: string;
  }>();

  const [terms, setTerms] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!districtId) return;
    try {
      setLoading(true);
      const { data: body } = await apiClient.get(`/districts/${districtId}`);
      const payload = body?.data ?? body;
      setTerms(payload.terms_and_conditions);
      setPrivacy(payload.privacy_policy);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los términos del municipio');
    } finally {
      setLoading(false);
    }
  }, [districtId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleAccept = async () => {
    if (!districtId) return;
    try {
      setSubmitting(true);
      await apiClient.put('/drivers/me/district', { district_id: districtId });
      navigation.replace('Online');
    } catch (err: any) {
      const message =
        err?.message ?? 'No se pudo confirmar el municipio. Intentá de nuevo.';
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Navbar
          title={districtName ?? 'Términos'}
          onBack={() => navigation.goBack()}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.turquoise} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Navbar
        title={districtName ?? 'Términos'}
        onBack={() => navigation.goBack()}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {terms ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Términos y Condiciones</Text>
            <Text style={styles.sectionText}>{stripHtml(terms)}</Text>
          </View>
        ) : null}
        {privacy ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Política de Privacidad</Text>
            <Text style={styles.sectionText}>{stripHtml(privacy)}</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title="Aceptar y continuar"
          variant="cta"
          onPress={handleAccept}
          loading={submitting}
          disabled={submitting}
        />
      </View>
    </View>
  );
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.white },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  section: { gap: theme.spacing.sm },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.deepBlue,
  },
  sectionText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    lineHeight: 24,
  },
  footer: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
});
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/DistrictTermsScreen.tsx
git commit -m "feat: add DistrictTermsScreen with terms acceptance and district assignment"
```

---

### Task 12: Mobile — OnlineScreen district check

**Files:**
- Modify: `apps/mobile/src/screens/OnlineScreen.tsx`

- [ ] **Step 1: Add district check on mount**

Read `apps/mobile/src/screens/OnlineScreen.tsx`. Add a `useEffect` that checks if the driver has a district, and redirect to `SelectProvince` if not.

Find the component function declaration and add the effect after any existing `useEffect` hooks. The exact insertion point depends on the file structure, but the logic is:

```typescript
  // Add this import at the top of the file:
  // import { apiClient } from '../api/client';

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get('/drivers/me/status')
      .then(({ data: body }: any) => {
        const payload = body?.data ?? body;
        if (!cancelled && payload?.status === 'approved' && !payload?.has_district) {
          navigation.replace('SelectProvince');
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/OnlineScreen.tsx
git commit -m "feat: redirect to district selection from OnlineScreen if no district"
```

---

### Task 13: Backend — Guard toggleOnline for no district

**Files:**
- Modify: `apps/backend/src/features/drivers/service.ts`

- [ ] **Step 1: Block online if no district assigned**

Edit `apps/backend/src/features/drivers/service.ts`, in the `toggleOnline` method. After the existing check for `documents_pending_review`, add a check for `district_id`:

Find:
```typescript
    if (isOnline && driver.documents_pending_review) {
      throw new AppError(
        'No podes conectarte: tenes documentos pendientes de revision.',
        409,
        'DOCUMENTS_UNDER_REVIEW',
      );
    }
```

Add after it:
```typescript
    if (isOnline && !driver.district_id) {
      throw new AppError(
        'Debes seleccionar un municipio antes de conectarte.',
        400,
        'DISTRICT_REQUIRED',
      );
    }
```

Also update the `select` query at the top of `toggleOnline` to include `district_id`:

Find:
```typescript
        id: drivers.id,
        is_online: drivers.is_online,
        documents_pending_review: drivers.documents_pending_review,
```

Replace with:
```typescript
        id: drivers.id,
        is_online: drivers.is_online,
        documents_pending_review: drivers.documents_pending_review,
        district_id: drivers.district_id,
```

- [ ] **Step 2: Run tests to ensure nothing breaks**

```bash
cd apps/backend && bun test
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/features/drivers/service.ts
git commit -m "feat: block going online without a selected district"
```

---

### Task 14: Backend — Run all tests and mobile typecheck (verification)

**Files:**
- None (verification only)

- [ ] **Step 1: Run all backend tests**

```bash
cd apps/backend && bun test
```

Expected: all tests pass (existing + new district/driver tests).

- [ ] **Step 2: Run backend typecheck**

```bash
cd apps/backend && bun run typecheck
```

- [ ] **Step 3: Run mobile typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 4: Run root-level check**

```bash
bun run check
```

- [ ] **Step 5: Fix any issues and commit final fixes if needed**


