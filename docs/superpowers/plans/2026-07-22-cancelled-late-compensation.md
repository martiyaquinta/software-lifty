# Cancelled Late Compensation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calculate compensation fare when a trip transitions to `cancelled_late` and update driver's `platform_debt`.

**Architecture:** In `transitionTrip`, after determining `actualTarget === 'cancelled_late'`, compute a minimum compensation fare using the trip's existing `base_fare`, set `total_fare`/`platform_fee`/`driver_earnings` on the trip row, and accumulate `platform_debt` on the driver row.

**Tech Stack:** Bun + Drizzle ORM + PostgreSQL

## Global Constraints

- All changes in `apps/backend/src/features/trips/service.ts` — no new files
- Use existing `calculatePlatformFee` from `src/shared/lib/pricing.ts`
- `platform_debt` accumulates immediately (like `collectTrip` with cash)
- Compensation total = `trip.base_fare` (minimum base fare, no distance/time charges)
- Update test 8 (cancelled_late) to verify fare fields and platform_debt

---

### Task 1: Add compensation fare calculation for cancelled_late

**Files:**
- Modify: `apps/backend/src/features/trips/service.ts:81-120` (inside `transitionTrip`)
- Modify: `apps/backend/src/features/trips/trips.test.ts:283-317` (test 8)

**Interfaces:**
- Consumes: `calculatePlatformFee` from `../../shared/lib/pricing` (already imported)
- Consumes: `drivers` from `../../shared/db/schema` (already imported)
- Produces: No new signatures — modifies internal behavior of `transitionTrip`

- [ ] **Step 1: Add fare calculation logic in `transitionTrip` for `cancelled_late`**

In `apps/backend/src/features/trips/service.ts`, inside the `transitionTrip` function, after the `actualTarget` determination block (line 86-94) and before the `VALID_TRANSITIONS` check (line 96), add the following block:

```ts
if (actualTarget === 'cancelled_late') {
  const compensationTotal = trip.base_fare ?? 0;
  const compensationPlatformFee = calculatePlatformFee(compensationTotal);
  const compensationDriverEarnings = compensationTotal - compensationPlatformFee;

  updateData.total_fare = compensationTotal;
  updateData.platform_fee = compensationPlatformFee;
  updateData.driver_earnings = compensationDriverEarnings;

  await tx
    .update(drivers)
    .set({
      platform_debt: sql`${drivers.platform_debt} + ${compensationPlatformFee}`,
      updated_at: new Date(),
    })
    .where(eq(drivers.id, trip.driver_id));
}
```

The modified `transitionTrip` function (from line 81) should look like:

```ts
async function transitionTrip(driverId: string, tripId: string, targetStatus: string) {
  return db.transaction(async (tx) => {
    const trip = await findTrip(driverId, tripId, tx);

    let actualTarget = targetStatus;

    if (targetStatus === 'cancelled' && trip.status === 'waiting') {
      const waitingSince = trip.waiting_since;
      if (!waitingSince)
        throw new AppError('Cannot cancel: waiting_since not set', 400, 'BAD_REQUEST');
      const elapsed = (Date.now() - waitingSince.getTime()) / 60000;
      const tolerance = trip.tolerance_minutes ?? 5;
      actualTarget = elapsed < tolerance ? 'cancelled_early' : 'cancelled_late';
    }

    const allowed = VALID_TRANSITIONS[trip.status];
    if (!allowed || !allowed.includes(actualTarget)) {
      throw new AppError(
        `Invalid transition from ${trip.status} to ${actualTarget}`,
        400,
        'BAD_REQUEST',
      );
    }

    const updateData: Record<string, any> = {
      status: actualTarget,
      updated_at: new Date(),
    };

    if (actualTarget === 'waiting') {
      updateData.waiting_since = new Date();
    }

    if (actualTarget === 'cancelled_late') {
      const compensationTotal = trip.base_fare ?? 0;
      const compensationPlatformFee = calculatePlatformFee(compensationTotal);
      const compensationDriverEarnings = compensationTotal - compensationPlatformFee;

      updateData.total_fare = compensationTotal;
      updateData.platform_fee = compensationPlatformFee;
      updateData.driver_earnings = compensationDriverEarnings;

      await tx
        .update(drivers)
        .set({
          platform_debt: sql`${drivers.platform_debt} + ${compensationPlatformFee}`,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, trip.driver_id));
    }

    await tx.update(trips).set(updateData).where(eq(trips.id, tripId));
    await recordEvent(tripId, trip.status, actualTarget, tx);

    const [updated] = await tx.select().from(trips).where(eq(trips.id, tripId));
    return updated;
  });
}
```

- [ ] **Step 2: Add fare assertions to test 8 (cancelled_late)**

In `apps/backend/src/features/trips/trips.test.ts`, modify test 8 (line 283-317) by adding fare and platform_debt assertions after `expect(data.status).toBe('cancelled_late');`:

```ts
test('8. cancel from waiting >= 5min → cancelled_late', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);

    const db = getDb();
    await db
      .update(trips)
      .set({
        status: 'waiting',
        waiting_since: new Date(Date.now() - 10 * 60 * 1000),
        updated_at: new Date(),
      })
      .where(eq(trips.id, trip.id));

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/cancel`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('cancelled_late');
    expect(data.total_fare).toBeGreaterThan(0);
    expect(data.platform_fee).toBeGreaterThan(0);
    expect(data.driver_earnings).toBeGreaterThan(0);
    expect(data.driver_earnings).toBeLessThan(data.total_fare);

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.platform_debt).toBeGreaterThan(0);
  });
```

Note: the variable `driverId` must be captured from `createDriverRow` on line 285 — change `await createDriverRow(token);` to `const driverId = await createDriverRow(token);`.

- [ ] **Step 3: Run the specific test to verify it passes**

Run: `bun test src/features/trips/trips.test.ts --test-name-pattern "cancel from waiting >= 5min"`

Expected: PASS with all new assertions passing.

- [ ] **Step 4: Run the full test suite to ensure no regressions**

Run: `cd apps/backend && bun test`

Expected: All 194+ tests passing.

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/features/trips/service.ts apps/backend/src/features/trips/trips.test.ts
git commit -m "fix(backend): calculate compensation fare on cancelled_late trips"
```
