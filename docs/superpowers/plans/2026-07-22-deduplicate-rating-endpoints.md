# Deduplicate Rating Endpoints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the duplicate `POST /api/trips/:id/rate` endpoint, leaving `POST /api/ratings/trips/:trip_id` as the single canonical rating endpoint.

**Architecture:** Delete the rate route from `trips/routes.ts`, the `rateTripBody` schema from `trips/schema.ts`, the `rateTrip` wrapper from `trips/service.ts`, and the `ratingsService` import. Relocate the trip-rate 404 test in `all-endpoints.test.ts` to use the ratings endpoint.

**Tech Stack:** Bun, Elysia, Drizzle ORM, Bun test

## Global Constraints

- All existing tests must pass after changes
- `POST /api/ratings/trips/:trip_id` remains unchanged
- No mobile app changes needed (no references to either endpoint)
- `bun run typecheck` must pass

---

### Task 1: Remove rate route from trips/routes.ts

**Files:**
- Modify: `apps/backend/src/features/trips/routes.ts`

**Interfaces:**
- Produces: Clean `tripRoutes` without the `/rate` sub-route

- [ ] **Step 1: Remove the rate route (lines 66-74) from trips/routes.ts**

```typescript
import { Elysia } from 'elysia';
import { authGuard } from '../../shared/middleware/require-auth';
import { collectBody, createTripBody, tripIdParams } from './schema';
import { tripService } from './service';

import { safeCall } from '../../shared/lib/route-utils';

export const tripRoutes = new Elysia({ prefix: '/trips' })
  .use(authGuard)
  .post('/', ({ user, body, set }) => safeCall(() => tripService.createTrip(user, body), set), {
    body: createTripBody,
    requireAuth: true,
  })
  .get('/active', ({ user, set }) => safeCall(() => tripService.getActiveTrip(user), set), {
    requireAuth: true,
  })
  .get(
    '/history',
    ({ user, query, set }) =>
      safeCall(
        () => tripService.getTripHistory(user, Number(query.page) || 1, Number(query.limit) || 20),
        set,
      ),
    { requireAuth: true },
  )
  .get(
    '/:id',
    ({ user, params, set }) => safeCall(() => tripService.getTripById(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/accept',
    ({ user, params, set }) => safeCall(() => tripService.acceptTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/reject',
    ({ user, params, set }) => safeCall(() => tripService.rejectTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/en-route',
    ({ user, params, set }) => safeCall(() => tripService.enRouteTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/arrived',
    ({ user, params, set }) => safeCall(() => tripService.arrivedTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/start',
    ({ user, params, set }) => safeCall(() => tripService.startTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/complete',
    ({ user, params, set }) => safeCall(() => tripService.completeTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .post(
    '/:id/cancel',
    ({ user, params, set }) => safeCall(() => tripService.cancelTrip(user, params.id), set),
    { params: tripIdParams, requireAuth: true },
  )
  .put(
    '/:id/collect',
    ({ user, params, body, set }) =>
      safeCall(() => tripService.collectTrip(user, params.id, body.payment_method), set),
    { params: tripIdParams, body: collectBody, requireAuth: true },
  );
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/features/trips/routes.ts
git commit -m "refactor: remove duplicate /trips/:id/rate route"
```

---

### Task 2: Remove rateTripBody from trips/schema.ts

**Files:**
- Modify: `apps/backend/src/features/trips/schema.ts`

**Interfaces:**
- Produces: Schema file without `rateTripBody` export

- [ ] **Step 1: Remove rateTripBody (lines 20-24)**

```typescript
import { t } from 'elysia';

export const tripIdParams = t.Object({
  id: t.String(),
});

export const createTripBody = t.Object({
  origin_lat: t.Number(),
  origin_lng: t.Number(),
  dest_lat: t.Number(),
  dest_lng: t.Number(),
  origin_address: t.Optional(t.String()),
  dest_address: t.Optional(t.String()),
  distance_km: t.Number(),
  duration_minutes: t.Number(),
  vehicle_type: t.String(),
  passenger_id: t.Optional(t.String()),
});

export const collectBody = t.Object({
  payment_method: t.Union([t.Literal('cash'), t.Literal('mercadopago')]),
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/features/trips/schema.ts
git commit -m "refactor: remove duplicate rateTripBody from trips schema"
```

---

### Task 3: Remove rateTrip wrapper and ratingsService import from trips/service.ts

**Files:**
- Modify: `apps/backend/src/features/trips/service.ts`

**Interfaces:**
- Consumes: None (the removed items were the only consumers of each other)
- Produces: `tripService` without `rateTrip` method and without `ratingsService` dependency

- [ ] **Step 1: Remove `rateTrip` method (lines 222-224) and `ratingsService` import (line 10)**

The import section becomes:
```typescript
import { and, desc, eq, inArray, not, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { getDriverId } from '../../shared/db/queries';
import { drivers, tripEvents, trips } from '../../shared/db/schema';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { calculateFare, calculatePlatformFee } from '../../shared/lib/pricing';
import { sendPushToUser } from '../../shared/lib/push';
import type { AuthUser } from '../../shared/middleware/auth';
```

Remove these lines (222-224):
```typescript
  async rateTrip(user: AuthUser, tripId: string, rating: number, comment?: string, tags?: string) {
    return ratingsService.rateTrip(user, tripId, { rating, tags, comment });
  },
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/features/trips/service.ts
git commit -m "refactor: remove rateTrip wrapper and ratingsService dependency from trips service"
```

---

### Task 4: Relocate trip rate 404 test in all-endpoints.test.ts

**Files:**
- Modify: `apps/backend/src/all-endpoints.test.ts`

**Interfaces:**
- Consumes: Test app setup from existing file
- Produces: Test file without reference to `/api/trips/:id/rate`, rating 404 test consolidated into existing Ratings section

- [ ] **Step 1: Remove the trip rate 404 test (lines 450-460) and add a rate 404 test to the Ratings section**

Remove lines 450-460:
```typescript
  test('rate → 404 non-existent', async () => {
    const token = await register('+54926100309');
    await driver(token);
    const { status } = await req(
      'POST',
      '/api/trips/00000000-0000-0000-0000-000000000000/rate',
      { rating: 4 },
      token,
    );
    expect(status).toBe(404);
  });
```

This test is already covered in the Ratings section (lines 647-656) which tests the same thing via `/api/ratings/trips/...`. No new test needed.

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/all-endpoints.test.ts
git commit -m "test: remove duplicate trip rate 404 test, already covered in Ratings section"
```

---

### Task 5: Verify — typecheck + tests

**Files:**
- None (verification only)

- [ ] **Step 1: Run typecheck**

```bash
bun run typecheck
```
Expected: PASS with no errors.

- [ ] **Step 2: Run tests**

```bash
bun run test
```
Expected: All 200+ tests pass.

- [ ] **Step 3: Final commit (if any fixes needed)**

If any issues found, fix and commit. Otherwise, done.
