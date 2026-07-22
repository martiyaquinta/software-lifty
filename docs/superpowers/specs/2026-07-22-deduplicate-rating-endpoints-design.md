# Deduplicate Rating Endpoints

## Context

Two endpoints serve the same purpose: rating a trip.

- `POST /api/trips/:id/rate` — `trips/routes.ts:66-74`
- `POST /api/ratings/trips/:trip_id` — `ratings/routes.ts:10-14`

Both call `ratingsService.rateTrip()` — the trips route delegates via `tripService.rateTrip()` which wraps `ratingsService.rateTrip()`.

There's also a duplicated schema: `rateTripBody` defined in both `trips/schema.ts` and `ratings/schema.ts`.

## Decision

**Eliminate** the trips-based rate endpoint entirely. `POST /api/ratings/trips/:trip_id` becomes the single canonical endpoint.

## Changes

| File | Change |
|---|---|
| `trips/routes.ts` | Remove `/:id/rate` route (lines 66-74), remove `rateTripBody` import |
| `trips/schema.ts` | Remove `rateTripBody` export (lines 20-24) |
| `trips/service.ts` | Remove `rateTrip()` method and `ratingsService` import |
| `all-endpoints.test.ts` | Remove/relocate trip rate 404 test; ratings section already covers this |

## Unchanged

- `ratings/routes.ts`, `ratings/service.ts`, `ratings/schema.ts`
- `ratings.test.ts` — already uses `POST /api/ratings/trips/:trip_id`
- Mobile — no references to either endpoint

## Verification

```bash
bun run typecheck && bun run test
```
