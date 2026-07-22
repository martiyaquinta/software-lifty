# Consolidate onboarding into drivers service

**Date**: 2026-07-21
**Issue**: [#90](https://github.com/anomalyco/software-lifty/issues/90)
**Status**: design approved

## Problem

The backend has two parallel onboarding implementations with incompatible status values:

- **`onboarding` service** (legacy): `POST /onboarding/step1|step2|step3`, `GET /onboarding/status`. Uses driver status values `kyc_pending`, `documents`, `review`.
- **`drivers` service** (current): `PUT /drivers/me`, `GET /drivers/me/status`. Uses status values `step1`, `pending`, `approved`, `rejected`, `suspended`. The mobile app uses exclusively drivers endpoints for status, profile, photo, and document reupload.

The mobile still uses `POST /onboarding/step3/upload` for initial document uploads — the only remaining dependency on the legacy service.

Additionally, `getMyStatus` in `drivers/service.ts` has no explicit handling for `kyc_pending` or `kyc_approved` status values, which can exist in the DB from the legacy flow or from the KYC webhook advancing a `step1` driver before profile completion.

## Approach

**Chosen**: Complete removal of `onboarding` service + explicit legacy status handling in `getMyStatus` + mobile migration. No DB migration.

### Why this approach

- Only 1 remaining dependency from mobile to legacy onboarding (document upload)
- The legacy code is 306 lines of duplicated logic
- `getMyStatus` already handles `kyc_pending`/`kyc_approved` implicitly (correctly), just not explicitly
- No DB migration needed — existing records are handled correctly in code

## Design

### Files changed

| File | Action |
|------|--------|
| `apps/backend/src/features/drivers/service.ts` | Add explicit `kyc_pending` and `kyc_approved` handling in `getMyStatus` |
| `apps/backend/src/features/onboarding/service.ts` | **Delete** |
| `apps/backend/src/features/onboarding/routes.ts` | **Delete** |
| `apps/backend/src/features/onboarding/schema.ts` | **Delete** |
| `apps/backend/src/features/onboarding/onboarding.test.ts` | **Delete** |
| `apps/backend/src/index.ts` | Remove onboarding routes import, swagger tag, and `.use()` registration |
| `apps/mobile/src/utils/upload.ts` | Change `POST /onboarding/step3/upload` → `POST /drivers/me/documents` |

#### Test files that use onboarding for setup → migrate to drivers endpoints

| Test file | Old setup calls | New setup calls |
|-----------|----------------|-----------------|
| `earnings/earnings.test.ts` | `POST /onboarding/step1` | `PUT /drivers/me` with `{ first_name }` |
| `sos/sos.test.ts` | `POST /onboarding/step1` | `PUT /drivers/me` with `{ first_name }` |
| `payments/payments.test.ts` | `POST /onboarding/step1` | `PUT /drivers/me` with `{ first_name }` |
| `kyc/kyc.test.ts` | `POST /onboarding/step1` | `PUT /drivers/me` with `{ first_name }` |
| `trips/trips.test.ts` | `POST /onboarding/step1` | `PUT /drivers/me` with `{ first_name }` |
| `ratings/ratings.test.ts` | `POST /onboarding/step1` | `PUT /drivers/me` with `{ first_name }` |
| `drivers/drivers.test.ts` | `POST /onboarding/step1`, `/step2` | `PUT /drivers/me` with profile + vehicle data |
| `admin/admin.test.ts` | `POST /onboarding/step1`, `/step2`, `/step3` | `PUT /drivers/me` + `POST /drivers/me/documents` |
| `all-endpoints.test.ts` | Multiple onboarding endpoints | Corresponding drivers endpoints |

**Migration pattern**: `POST /onboarding/step1 { full_name }` → `PUT /drivers/me { first_name }`. The `updateProfile` endpoint creates the driver row and sets the name in one call — no need for separate step1 + step2 calls.

### `getMyStatus` changes

Insert two explicit cases after terminal state checks (suspended, approved, rejected) and **before** the KYC gate (line 119):

```typescript
// Legacy status from old onboarding flow — treat same as KYC-pending.
if (driver.status === 'kyc_pending') {
  return { status: 'pending', step: 'kyc', kyc_status: driver.kyc_status };
}

// Legacy status from KYC webhook advancing a step1 driver before profile
// completion. kyc_status is already 'approved', so skip the KYC gate and
// continue to vehicle check below.
if (driver.status === 'kyc_approved') {
  // fall through to vehicle check
}
```

The existing KYC gate (`driver.kyc_status !== 'approved' && driver.status !== 'step1'`) already excludes `kyc_approved` correctly (kyc_status IS approved), but the explicit handling makes intent clear.

### KYC webhook (no changes)

`kyc/service.ts:172` is left as-is:
```typescript
if (drv && (drv.status === 'step1' || drv.status === 'kyc' || drv.status === 'kyc_pending')) {
  driverUpdateData.status = 'kyc_approved';
}
```

The `driversService.updateProfile` advances `step1` → `pending` after profile data is saved, so for new drivers the webhook condition is a no-op. Only legacy records or edge cases (KYC completes before profile data is saved) trigger this path — and `getMyStatus` handles the resulting `kyc_approved` explicitly.

### State transition table (post-change)

| `driver.status` (DB) | `kyc_status` (DB) | `getMyStatus` response |
|---|---|---|
| `step1` | `pending` | `{ step: 'profile' }` |
| `pending` | `pending` | `{ step: 'kyc' }` |
| `kyc_pending` (legacy) | `pending` | `{ step: 'kyc' }` ← explicit |
| `pending` | `approved` | `{ step: 'vehicle' }` (if no vehicle) |
| `kyc_approved` (legacy) | `approved` | `{ step: 'vehicle' }` ← explicit |
| `pending` | `approved` | `{ step: 'documents' }` (vehicle exists, missing docs) |
| `review` | `approved` | `{ step: 'review' }` |
| `approved` | `approved` | `{ step: 'approved' }` |
| `rejected` | — | `{ step: 'review' }` (terminal) |
| `suspended` | — | `{ step: 'approved' }` (terminal) |

### Error handling

No new error paths. `addDocument` in `driversService` already validates `doc_type`, checks KYC gate, and returns the same shape as the old `onboarding.uploadDocument`.

## Verification

1. `bun --filter @lifty/backend typecheck` — no type errors
2. `bun --filter @lifty/mobile typecheck` — no type errors
3. `bun --filter @lifty/backend test` — all 10+ test suites pass after migrating setup calls
4. `bun run lint` — biome passes
5. Manual verification: upload a document from the mobile app → it should hit `POST /drivers/me/documents` and work identically
