# Real-time Route Directions — Design Spec

**Date**: 2026-07-20
**Status**: Approved

## Problem

During the `in_trip` phase (driver taking passenger to destination), the app shows:
- A **mock/hardcoded polyline** (5 fabricated coordinates in `TripInProgressScreen.tsx`)
- Hardcoded ETA and distance ("~5 min · 3.2 km")
- Hardcoded destination name ("Terminal de Omnibus")
- No route at all on `NavigationScreen` (en route to pickup)

Additionally, the current OSRM integration only fetches the fastest route, which can include irrelevant side streets (shortcuts through neighborhoods). The user wants routes that prioritize main roads/avenues.

## Solution

### Backend: Intelligent route selection with OSRM alternatives

**File**: `apps/backend/src/shared/lib/geo.ts` — function `directions()`

Modify the OSRM request to include `alternatives=true&steps=true&overview=full`. This returns up to 3 routes with step-by-step metadata.

For each alternative route, score it by road hierarchy:

1. **Road name scoring**: steps with names containing `Av.`, `Autopista`, `AU`, `RN`, or `Ruta` receive bonus points proportional to their distance
2. **Turn penalty**: each maneuver of type `turn`, `roundabout`, `fork`, or `end of road` subtracts points
3. **Segment length bonus**: longer steps (typical of highways/avenues) get a small bonus
4. Select the route with the highest total score

Scoring pseudocode:

```
for each route:
  score = 0
  for each step in route.legs[0].steps:
    if step.name matches main road pattern:
      score += step.distance / 100
    score += step.distance / 500
    if step.maneuver.type in ['turn', 'roundabout', 'fork', 'end of road']:
      score -= 20
```

**API contract unchanged**: `DirectionsResult` still returns `{ distance_km, duration_minutes, polyline }`. Redis caching unchanged (5 min TTL). OSRM fallback (Haversine) unchanged.

**Edge case**: If OSRM returns only 1 route or no steps data, fall back to that single route as before.

### Mobile: Polyline decoder

**File**: `apps/mobile/src/lib/polyline.ts`

OSRM returns Google-encoded polyline strings. The `MapView` component expects raw `[lng, lat][]` arrays.

- `decodePolyline(encoded: string): [number, number][]`
- Standard algorithm: decode base64 chars → cumulative lat/lng deltas
- Swap `[lat, lng]` → `[lng, lat]` for GeoJSON/MapLibre compatibility
- ~30 lines, zero dependencies

### Mobile: tripStore with full trip data

**File**: `apps/mobile/src/store/tripStore.ts`

Current store: `{ activeTripId, tripStatus }`
New store: `{ activeTripId, tripStatus, trip: Trip | null }`

`setActiveTrip` signature changes from `(tripId, status)` to `(trip: Trip)`.

**Callers to update** (3 sites):
1. `AppInitializer.tsx:78` — active trip recovery (has full trip object)
2. `ActiveScreen.tsx` or equivalent — when new trip is received via real-time
3. `IncomingRequestScreen.tsx` — when accepting a trip

### Mobile: NavigationScreen — real route to pickup

**File**: `apps/mobile/src/screens/NavigationScreen.tsx`

- Replace hardcoded `PASSENGER_COORD` with `tripStore.trip.origin_lat/origin_lng`
- On mount, fetch `GET /maps/directions` with origin = driver's current location (`locationStore`) and dest = passenger pickup coordinates
- Decode polyline → pass as `routeLine` to `MapView`
- Show real ETA/distance from API response (replace "4 min · 1.8 km")
- Show real address from `trip.origin_address` (replace "Av. San Martin 450")
- Implement "Abrir en Waze" and "Abrir en Maps" deep links with real coordinates

### Mobile: TripInProgressScreen — real route to destination

**File**: `apps/mobile/src/screens/TripInProgressScreen.tsx`

- Remove `MOCK_ROUTE`
- On mount, fetch `GET /maps/directions` with origin = current location and dest = `trip.dest_lat/dest_lng`
- Decode polyline → pass as `routeLine`
- Real ETA/distance from API response
- Real destination address from `trip.dest_address`
- Progress bar calculated from remaining distance vs total distance
- Re-fetch route every 10 seconds to reflect driver advancement (debounced)

## Files Changed

| File | Change |
|---|---|
| `apps/backend/src/shared/lib/geo.ts` | Add `alternatives=true&steps=true`, route scoring logic |
| `apps/mobile/src/lib/polyline.ts` | **New file** — `decodePolyline()` |
| `apps/mobile/src/store/tripStore.ts` | Add `trip: Trip` field, change `setActiveTrip` signature |
| `apps/mobile/src/screens/NavigationScreen.tsx` | Real directions, real coords, deep links |
| `apps/mobile/src/screens/TripInProgressScreen.tsx` | Real directions, real ETA, remove mocks |
| `apps/mobile/src/components/AppInitializer.tsx` | Pass full trip to `setActiveTrip` |
| `apps/mobile/src/screens/ActiveScreen.tsx` (or equivalent) | Pass full trip to `setActiveTrip` |

## Testing

### Backend
- Unit test: `directions()` returns the most hierarchical route when OSRM provides alternatives
- Unit test: `directions()` fallback to single route when alternatives unavailable
- Existing tests in `maps.test.ts` should still pass (interface unchanged)

### Mobile
- `decodePolyline()` decodes valid OSRM polyline → correct `[lng, lat][]`
- `decodePolyline()` handles empty/edge case input

## Out of Scope
- Real-time traffic data (requires paid API — OSRM is free)
- Passenger-side app (not yet implemented)
- Re-routing on deviation from planned route
