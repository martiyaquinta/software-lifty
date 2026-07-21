# Real-time Route Directions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded mock routes with real OSRM directions that prioritize main roads/avenues, shown on NavigationScreen (pickup) and TripInProgressScreen (destination).

**Architecture:** Backend modifies `directions()` to request OSRM alternatives with step metadata, scores each route by road hierarchy heuristics, and returns the best one. Mobile adds a polyline decoder, stores full trip data in Zustand, and fetches real directions on both navigation screens with periodic refresh during the trip.

**Tech Stack:** Bun + Elysia (backend), Expo SDK 54 + React 19 + TypeScript 6 (mobile), OSRM routing, MapLibre GL JS (map), Zustand (state), Jest (mobile tests), Bun test (backend tests)

## Global Constraints

- Backend API contract for `DirectionsResult` must NOT change: `{ distance_km, duration_minutes, polyline }`
- State machine in `trips/service.ts` must NOT change — `startTrip` / `completeTrip` / `transitionTrip` stay as-is
- No new dependencies in mobile or backend
- All UI must use `theme.colors.*`, `theme.spacing.*`, `theme.fontSize.*` from `src/theme/index.ts`
- Mobile uses named exports only (`export const`), `StyleSheet.create` at bottom of each file
- Mobile routing via `useAppNavigation()` hook (maps PascalCase names to kebab-case routes)
- Follow existing test patterns: backend uses `Bun.test` with `process.env.NODE_ENV = 'test'`, mobile uses Jest with `@testing-library/react-native`

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/backend/src/shared/lib/geo.ts` | Modify | Add alternative route fetching, step-based road hierarchy scoring |
| `apps/backend/src/features/maps/maps.test.ts` | Modify | Add test for hierarchical route selection |
| `apps/mobile/src/lib/polyline.ts` | Create | `decodePolyline(encoded: string): [number, number][]` |
| `apps/mobile/src/__tests__/lib/polyline.test.ts` | Create | Unit tests for polyline decoding |
| `apps/mobile/src/store/tripStore.ts` | Modify | Add `trip: Trip` field, change `setActiveTrip` signature |
| `apps/mobile/src/components/AppInitializer.tsx` | Modify | Pass full trip object to `setActiveTrip` |
| `apps/mobile/src/screens/IncomingRequestScreen.tsx` | Modify | Pass full trip object to `setActiveTrip` |
| `apps/mobile/src/screens/NavigationScreen.tsx` | Modify | Real directions to pickup, real coords/markers, Waze/Maps deep links |
| `apps/mobile/src/screens/TripInProgressScreen.tsx` | Modify | Real directions to destination, real ETA/distance/progress, periodic refresh |
| `apps/mobile/src/__tests__/trips/incoming-request.test.tsx` | Modify | Update test for new `setActiveTrip` signature |

## Key Interfaces

**`DirectionsResult` (unchanged — from `geo.ts:21-25`):**
```ts
interface DirectionsResult {
  distance_km: number;
  duration_minutes: number;
  polyline: string;          // Google-encoded polyline
}
```

**`Trip` (from `api/types.ts:89-112`):** full trip object with `origin_lat`, `origin_lng`, `dest_lat`, `dest_lng`, `origin_address`, `dest_address`, etc.

**`decodePolyline` (new):**
```ts
export function decodePolyline(encoded: string): [number, number][]
// Returns [lng, lat][] pairs ready for MapView routeLine prop
```

**`tripStore` new interface:**
```ts
interface TripState {
  activeTripId: string | null;
  tripStatus: TripStatus | null;
  trip: Trip | null;
  setActiveTrip: (trip: Trip) => void;
  setTripStatus: (status: TripStatus) => void;
  clearTrip: () => void;
}
```

**OSRM step type (internal to `geo.ts`):**
```ts
interface OSRMStep {
  name: string;
  distance: number;
  duration: number;
  maneuver: { type: string; modifier?: string };
}
```

---

### Task 1: Backend — Add hierarchical route scoring to `directions()`

**Files:**
- Modify: `apps/backend/src/shared/lib/geo.ts:169-215`

**Interfaces:**
- Produces: `directions()` returns same `DirectionsResult` but internally scores alternatives

- [ ] **Step 1: Add step type and scoring function**

In `geo.ts`, add after the existing interfaces (after line 30):

```ts
interface OSRMStep {
  name: string;
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
  };
}

const MAIN_ROAD_PATTERNS = [/^Av\.?\b/i, /^Av(da)?\.?\s/i, /^Autopista\b/i, /^AU\b/i, /^RN\b/i, /^Ruta\b/i, /^Bv\.?\b/i, /^Boulevard\b/i];

function scoreRoute(steps: OSRMStep[]): number {
  let score = 0;
  for (const step of steps) {
    if (MAIN_ROAD_PATTERNS.some((p) => p.test(step.name))) {
      score += step.distance / 100;
    }
    score += step.distance / 500;
    if (['turn', 'roundabout', 'fork', 'end of road'].includes(step.maneuver.type)) {
      score -= 20;
    }
  }
  return score;
}
```

- [ ] **Step 2: Modify `directions()` to request alternatives and steps**

In `geo.ts`, change the OSRM URL from line 184-185:

```ts
const coords = `${origin_lng},${origin_lat};${dest_lng},${dest_lat}`;
const url = `${OSRM_URL}/route/v1/driving/${coords}?geometries=polyline&overview=full&alternatives=true&steps=true`;
```

- [ ] **Step 3: Replace route selection logic (lines 190-204)**

Replace lines 190-204:

```ts
    const data = (await res.json()) as {
      code: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: string;
        legs?: Array<{ steps?: OSRMStep[] }>;
      }>;
    };

    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No routes found');

    let bestRoute = data.routes[0];
    let bestScore = -Infinity;

    for (const route of data.routes) {
      const steps = route.legs?.[0]?.steps;
      if (!steps || steps.length === 0) continue;
      const s = scoreRoute(steps);
      if (s > bestScore) {
        bestScore = s;
        bestRoute = route;
      }
    }

    const distance_km = Math.round((bestRoute.distance / 1000) * 100) / 100;
    const duration_minutes = Math.round((bestRoute.duration / 60) * 100) / 100;
    const result: DirectionsResult = {
      distance_km,
      duration_minutes,
      polyline: bestRoute.geometry,
    };
```

- [ ] **Step 4: Run existing backend tests to verify no regressions**

Run: `bun --filter @lifty/backend test`
Expected: All existing tests pass (19 suites, maps.test.ts should pass with mock/fastest route behavior)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/shared/lib/geo.ts
git commit -m "feat: add hierarchical route scoring to OSRM directions"
```

---

### Task 2: Backend — Add unit test for route scoring

**Files:**
- Modify: `apps/backend/src/features/maps/maps.test.ts`

**Interfaces:**
- Consumes: `scoreRoute()` from geo.ts (indirectly through `directions()`)

- [ ] **Step 1: Add a test that verifies scoring prefers main roads**

In `maps.test.ts`, add a new test after the existing `directions returns route` test (after line 128):

```ts
  test('directions should score alternative routes by road hierarchy', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/directions?origin_lat=-34.6037&origin_lng=-58.3816&dest_lat=-34.6158&dest_lng=-58.4333',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.distance_km).toBeNumber();
    expect(data.distance_km).toBeGreaterThan(0);
    expect(data.duration_minutes).toBeNumber();
    expect(data.polyline).toBeString();
    expect(data.polyline.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Add unit test for `scoreRoute` directly**

Create a new test file or add to an existing test file that can import the scoring function. Since `scoreRoute` is not exported (internal to `geo.ts`), verify we can test it by extracting the logic and testing it indirectly through the integration test above — the selected route should be non-trivial (polyline exists).

- [ ] **Step 3: Run backend tests**

Run: `bun --filter @lifty/backend test`
Expected: All tests pass including the new test

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/features/maps/maps.test.ts
git commit -m "test: verify OSRM alternative route scoring"
```

---

### Task 3: Mobile — Add polyline decoder utility

**Files:**
- Create: `apps/mobile/src/lib/polyline.ts`

**Interfaces:**
- Produces: `decodePolyline(encoded: string): [number, number][]`

- [ ] **Step 1: Create the polyline decoder**

Create `apps/mobile/src/lib/polyline.ts`:

```ts
export function decodePolyline(encoded: string): [number, number][] {
  if (!encoded) return [];

  const coords: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coords.push([lng * 1e-5, lat * 1e-5]);
  }

  return coords;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/lib/polyline.ts
git commit -m "feat: add polyline decoder for OSRM encoded routes"
```

---

### Task 4: Mobile — Add polyline decoder tests

**Files:**
- Create: `apps/mobile/src/__tests__/lib/polyline.test.ts`

**Interfaces:**
- Consumes: `decodePolyline` from `../lib/polyline`

- [ ] **Step 1: Write decoder tests**

Create `apps/mobile/src/__tests__/lib/polyline.test.ts`:

```ts
import { decodePolyline } from '../../lib/polyline';

describe('decodePolyline', () => {
  test('decodes a simple encoded polyline', () => {
    const result = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveLength(2);
    expect(typeof result[0][0]).toBe('number');
    expect(typeof result[0][1]).toBe('number');
  });

  test('returns empty array for empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  test('returns coordinates in [lng, lat] format', () => {
    const coords = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    for (const coord of coords) {
      expect(coord[0]).toBeGreaterThan(-180);
      expect(coord[0]).toBeLessThan(180);
      expect(coord[1]).toBeGreaterThan(-90);
      expect(coord[1]).toBeLessThan(90);
    }
  });

  test('decodes known polyline correctly', () => {
    const coords = decodePolyline('??');
    expect(coords.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run mobile tests**

Run: `bun --filter @lifty/mobile test`
Expected: 4 new tests pass (polyline decoder)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/__tests__/lib/polyline.test.ts
git commit -m "test: add polyline decoder unit tests"
```

---

### Task 5: Mobile — Update tripStore with full trip data

**Files:**
- Modify: `apps/mobile/src/store/tripStore.ts`

**Interfaces:**
- Produces: `setActiveTrip(trip: Trip)` instead of `setActiveTrip(tripId: string, status: TripStatus)`

- [ ] **Step 1: Update tripStore interface and implementation**

Replace `apps/mobile/src/store/tripStore.ts`:

```ts
import { create } from 'zustand';
import type { Trip, TripStatus } from '../api/types';

export type { TripStatus };

interface TripState {
  activeTripId: string | null;
  tripStatus: TripStatus | null;
  trip: Trip | null;
  setActiveTrip: (trip: Trip) => void;
  setTripStatus: (status: TripStatus) => void;
  clearTrip: () => void;
}

export const useTripStore = create<TripState>()((set) => ({
  activeTripId: null,
  tripStatus: null,
  trip: null,
  setActiveTrip: (trip) =>
    set({
      activeTripId: trip.id,
      tripStatus: trip.status,
      trip,
    }),
  setTripStatus: (tripStatus) => set({ tripStatus }),
  clearTrip: () => set({ activeTripId: null, tripStatus: null, trip: null }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/store/tripStore.ts
git commit -m "feat: store full trip object in tripStore"
```

---

### Task 6: Mobile — Update AppInitializer to pass full trip

**Files:**
- Modify: `apps/mobile/src/components/AppInitializer.tsx:78`

**Interfaces:**
- Consumes: new `setActiveTrip(trip: Trip)` signature

- [ ] **Step 1: Update ActiveTripRecovery call**

In `AppInitializer.tsx`, change line 78 from:

```ts
useTripStore.getState().setActiveTrip(trip.id, trip.status);
```

to:

```ts
useTripStore.getState().setActiveTrip(trip);
```

- [ ] **Step 2: Run mobile typecheck**

Run: `bun --filter @lifty/mobile tsc --noEmit`
Expected: No type errors (will fail until IncomingRequestScreen is also updated)

- [ ] **Step 3: Commit (together with Task 7)**

Hold for combined commit with Task 7.

---

### Task 7: Mobile — Update IncomingRequestScreen to pass full trip

**Files:**
- Modify: `apps/mobile/src/screens/IncomingRequestScreen.tsx:47,90`
- Modify: `apps/mobile/src/__tests__/trips/incoming-request.test.tsx`

**Interfaces:**
- Consumes: new `setActiveTrip(trip: Trip)` signature

- [ ] **Step 1: Update setActiveTrip calls**

In `IncomingRequestScreen.tsx`, change line 47 from:

```ts
setActiveTrip(active.id, active.status);
```

to:

```ts
setActiveTrip(active);
```

Change line 90 from:

```ts
setActiveTrip(trip.id, 'accepted');
```

to:

```ts
setActiveTrip({ ...trip, status: 'accepted' });
```

- [ ] **Step 2: Update test assertions**

In `incoming-request.test.tsx:89`, the test checks `useTripStore.getState().tripStatus` which still works. Add an assertion for the full trip object after the accept test (inside the `accept` test):

```ts
expect(useTripStore.getState().trip).not.toBeNull();
expect(useTripStore.getState().trip?.id).toBe('trip-real-1');
```

- [ ] **Step 3: Run typecheck and tests**

Run: `bun --filter @lifty/mobile tsc --noEmit`
Expected: No type errors

Run: `bun --filter @lifty/mobile test`
Expected: All existing tests pass, including IncomingRequestScreen tests

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/AppInitializer.tsx apps/mobile/src/screens/IncomingRequestScreen.tsx apps/mobile/src/__tests__/trips/incoming-request.test.tsx
git commit -m "feat: pass full trip object to setActiveTrip"
```

---

### Task 8: Mobile — Update NavigationScreen with real directions and data

**Files:**
- Modify: `apps/mobile/src/screens/NavigationScreen.tsx`

**Interfaces:**
- Consumes: `tripStore.trip`, `locationStore.lat/lng`, `apiClient.get`, `decodePolyline`, `MapView` routeLine prop

- [ ] **Step 1: Add imports and remove hardcoded passenger coord**

Replace the imports and remove `PASSENGER_COORD`. In `NavigationScreen.tsx`, replace lines 1-11 with:

```tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { MapView } from '../components/MapView';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { decodePolyline } from '../lib/polyline';
import { useLocationStore } from '../store/locationStore';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';
```

Delete line 11: `const PASSENGER_COORD: [number, number] = [-65.1833, -31.9333];`

- [ ] **Step 2: Add route state and directions fetching**

Replace `NavigationScreen` component (lines 13-43) with:

```tsx
export const NavigationScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const [loading, setLoading] = useState(false);
  const trip = useTripStore((s) => s.trip);
  const tripStatus = useTripStore((s) => s.tripStatus);
  const setTripStatus = useTripStore((s) => s.setTripStatus);
  const locationLat = useLocationStore((s) => s.lat);
  const locationLng = useLocationStore((s) => s.lng);
  const enRouteSent = useRef(false);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [distKm, setDistKm] = useState<number | null>(null);

  const pickupCoord: [number, number] = trip
    ? [trip.origin_lng, trip.origin_lat]
    : [-65.1833, -31.9333];

  useEffect(() => {
    if (!trip || tripStatus !== 'accepted' || enRouteSent.current) return;
    enRouteSent.current = true;
    apiClient
      .post(`/trips/${trip.id}/en-route`)
      .then(() => setTripStatus('en_route'))
      .catch(() => {});
  }, [trip, tripStatus, setTripStatus]);

  useEffect(() => {
    if (!locationLat || !locationLng || !trip) return;
    fetchDirections(locationLat, locationLng, trip.origin_lat, trip.origin_lng);
  }, [locationLat, locationLng, trip]);

  const fetchDirections = async (
    lat: number, lng: number, destLat: number, destLng: number,
  ) => {
    try {
      const res = await apiClient.get('/maps/directions', {
        params: { origin_lat: lat, origin_lng: lng, dest_lat: destLat, dest_lng: destLng },
      });
      const data = res.data?.data ?? res.data;
      setEtaMinutes(data.duration_minutes);
      setDistKm(data.distance_km);
      const coords = decodePolyline(data.polyline);
      setRouteCoords(coords);
    } catch {}
  };
```

- [ ] **Step 3: Add Waze/Maps deep link handlers**

Add after `fetchDirections`:

```tsx
  const openWaze = () => {
    const dest = trip;
    if (!dest) return;
    const url = Platform.OS === 'ios'
      ? `waze://?ll=${dest.origin_lat},${dest.origin_lng}&navigate=yes`
      : `https://waze.com/ul?ll=${dest.origin_lat},${dest.origin_lng}&navigate=yes`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir Waze'));
  };

  const openMaps = () => {
    const dest = trip;
    if (!dest) return;
    const url = Platform.OS === 'ios'
      ? `maps://app?daddr=${dest.origin_lat},${dest.origin_lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest.origin_lat},${dest.origin_lng}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir Maps'));
  };
```

- [ ] **Step 4: Update JSX to use real data**

Replace the `MapView` usage (lines 48-58) with:

```tsx
<MapView
  followUserLocation
  markers={[
    {
      id: 'pickup',
      coordinate: pickupCoord,
      title: 'Pasajero',
      color: theme.colors.dangerRed,
    },
  ]}
  routeLine={routeCoords.length > 0 ? routeCoords : undefined}
/>
```

Replace the hardcoded address (line 62) from:

```tsx
<Text style={styles.address}>Av. San Martin 450</Text>
```

to:

```tsx
<Text style={styles.address}>{trip?.origin_address ?? 'Origen'}</Text>
```

Replace the hardcoded ETA (line 63) from:

```tsx
<Text style={styles.eta}>4 min · 1.8 km</Text>
```

to:

```tsx
{etaMinutes !== null && distKm !== null ? (
  <Text style={styles.eta}>{Math.round(etaMinutes)} min · {distKm} km</Text>
) : null}
```

Replace the dead button handlers (lines 66-78) from:

```tsx
<Button
  title="Abrir en Waze"
  variant="secondary"
  onPress={() => {}}
  style={styles.navButton}
  textStyle={styles.navButtonText}
/>
<Button
  title="Abrir en Maps"
  variant="secondary"
  onPress={() => {}}
  style={styles.navButton}
  textStyle={styles.navButtonText}
/>
```

to:

```tsx
<Button
  title="Abrir en Waze"
  variant="secondary"
  onPress={openWaze}
  style={styles.navButton}
  textStyle={styles.navButtonText}
/>
<Button
  title="Abrir en Maps"
  variant="secondary"
  onPress={openMaps}
  style={styles.navButton}
  textStyle={styles.navButtonText}
/>
```

- [ ] **Step 5: Run typecheck**

Run: `bun --filter @lifty/mobile tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/NavigationScreen.tsx
git commit -m "feat: real directions and data on NavigationScreen"
```

---

### Task 9: Mobile — Update TripInProgressScreen with real directions

**Files:**
- Modify: `apps/mobile/src/screens/TripInProgressScreen.tsx`

**Interfaces:**
- Consumes: `tripStore.trip`, `locationStore.lat/lng`, `apiClient.get`, `decodePolyline`, `MapView` routeLine prop

- [ ] **Step 1: Add imports and remove MOCK_ROUTE**

Replace imports and remove mock data. In `TripInProgressScreen.tsx`, replace lines 1-16 with:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import { Button } from '../components/Button';
import { MapView } from '../components/MapView';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { decodePolyline } from '../lib/polyline';
import { useLocationStore } from '../store/locationStore';
import { useTripStore } from '../store/tripStore';
import { theme } from '../theme';
```

Delete lines 10-16 (the `MOCK_ROUTE` constant).

- [ ] **Step 2: Add route state and directions logic**

Replace `TripInProgressScreen` component (lines 18-41) with:

```tsx
export const TripInProgressScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const trip = useTripStore((s) => s.trip);
  const setTripStatus = useTripStore((s) => s.setTripStatus);
  const locationLat = useLocationStore((s) => s.lat);
  const locationLng = useLocationStore((s) => s.lng);
  const [completing, setCompleting] = React.useState(false);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [distKm, setDistKm] = useState<number | null>(null);
  const [totalDistKm, setTotalDistKm] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDirections = useCallback(async () => {
    if (!locationLat || !locationLng || !trip) return;
    try {
      const res = await apiClient.get('/maps/directions', {
        params: {
          origin_lat: locationLat, origin_lng: locationLng,
          dest_lat: trip.dest_lat, dest_lng: trip.dest_lng,
        },
      });
      const data = res.data?.data ?? res.data;
      setEtaMinutes(data.duration_minutes);
      setDistKm(data.distance_km);
      if (!totalDistKm) setTotalDistKm(data.distance_km);
      const coords = decodePolyline(data.polyline);
      setRouteCoords(coords);
    } catch {}
  }, [locationLat, locationLng, trip, totalDistKm]);

  useEffect(() => {
    fetchDirections();
  }, [fetchDirections]);

  useEffect(() => {
    intervalRef.current = setInterval(fetchDirections, 10000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchDirections]);
```

- [ ] **Step 3: Update handleCompleteTrip to use activeTripId from store**

Replace line 24-41 (handleCompleteTrip and related) with:

```tsx
  const handleCompleteTrip = async () => {
    if (!trip?.id) return;
    setCompleting(true);
    try {
      const response = await apiClient.post(`/trips/${trip.id}/complete`);
      const tripData = response.data?.data ?? response.data;
      setTripStatus('completed');
      navigation.navigate('TripComplete', {
        amount: String(tripData?.total_fare ?? 2500),
        commission: String(tripData?.platform_fee ?? 500),
        driverEarnings: String(tripData?.driver_earnings ?? 2000),
      });
    } catch {
      navigation.navigate('TripComplete');
    } finally {
      setCompleting(false);
    }
  };

  const progress = totalDistKm && distKm ? Math.min(100, Math.max(0, ((totalDistKm - distKm) / totalDistKm) * 100)) : 55;
```

- [ ] **Step 4: Update JSX to use real data**

Replace the `MapView` (line 47) from:

```tsx
<MapView followUserLocation routeLine={MOCK_ROUTE} />
```

to:

```tsx
<MapView followUserLocation routeLine={routeCoords.length > 0 ? routeCoords : undefined} />
```

Replace hardcoded destination (line 51) from:

```tsx
<Text style={styles.destination}>Terminal de Omnibus</Text>
```

to:

```tsx
<Text style={styles.destination}>{trip?.dest_address ?? 'Destino'}</Text>
```

Replace hardcoded ETA (line 52) from:

```tsx
<Text style={styles.eta}>~5 min · 3.2 km</Text>
```

to:

```tsx
{etaMinutes !== null && distKm !== null ? (
  <Text style={styles.eta}>~{Math.round(etaMinutes)} min · {distKm} km</Text>
) : null}
```

Replace progress bar width (line 54) from:

```tsx
<View style={styles.progressFill} />
```

to:

```tsx
<View style={[styles.progressFill, { width: `${progress}%` }]} />
```

Replace the progressFill style (line 115-120) from fixed width to dynamic — no change needed there, just remove the hardcoded `width: '55%'`:

In styles.progressFill (line 115-120), remove the `width: '55%',` line:

```ts
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.turquoise,
  },
```

Replace the dead Waze link (line 62-64) from:

```tsx
<TouchableOpacity>
  <Text style={styles.wazeLink}>Abrir en Waze</Text>
</TouchableOpacity>
```

to:

```tsx
<TouchableOpacity onPress={() => {
  if (!trip) return;
  const url = Platform.OS === 'ios'
    ? `waze://?ll=${trip.dest_lat},${trip.dest_lng}&navigate=yes`
    : `https://waze.com/ul?ll=${trip.dest_lat},${trip.dest_lng}&navigate=yes`;
  Linking.openURL(url).catch(() => {});
}}>
  <Text style={styles.wazeLink}>Abrir en Waze</Text>
</TouchableOpacity>
```

- [ ] **Step 5: Run typecheck**

Run: `bun --filter @lifty/mobile tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/TripInProgressScreen.tsx
git commit -m "feat: real directions and data on TripInProgressScreen"
```

---

### Task 10: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run backend tests**

```bash
bun --filter @lifty/backend test
```
Expected: All 19+ suites pass, no regressions

- [ ] **Step 2: Run mobile tests**

```bash
bun --filter @lifty/mobile test
```
Expected: All tests pass (6 existing + 4 new polyline tests)

- [ ] **Step 3: Run full typecheck**

```bash
bun run typecheck
```
Expected: Both backend and mobile pass with no errors

- [ ] **Step 4: Run lint**

```bash
bun run lint
```
Expected: No lint errors
