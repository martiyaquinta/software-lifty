# Trip History Screen — Design Spec

**Issue**: [#98](https://github.com/martiyaquinta/software-lifty/issues/98) — [mobile] Falta pantalla de historial de viajes
**Date**: 2026-07-22
**Status**: Approved
**Scope**: Mobile-only (no backend changes)

## Summary

Create `TripHistoryScreen` in the mobile app that displays all trips (any status) for the logged-in driver, with pagination. The backend endpoint `GET /api/trips/history` already exists and returns trips ordered by `created_at DESC`. Accessible from Earnings screen and the side menu.

## Architecture

### Files to create
- `apps/mobile/src/screens/TripHistoryScreen.tsx` — screen component
- `apps/mobile/app/trip-history.tsx` — route re-export

### Files to modify
- `apps/mobile/src/hooks/useAppNavigation.ts` — add `TripHistory` route and type
- `apps/mobile/src/screens/EarningsScreen.tsx` — add "Ver historial completo" link
- `apps/mobile/src/screens/OnlineScreen.tsx` — add side menu item
- `apps/mobile/src/screens/ActiveScreen.tsx` — add side menu item

## API

**Endpoint**: `GET /api/trips/history?page=1&limit=20`
- Auth required
- Returns `Trip[]` (array, no wrapper metadata)
- Ordered by `created_at` DESC

**Pagination heuristic** (no total count from backend):
- Track last page response length
- If `lastResponse.length < limit`, hide "Load more" button — no more pages
- `useQuery` with `queryKey: ['trip-history', page]`; increment page on load-more

## Screen Design

### States

| State | UI |
|-------|-----|
| Initial loading | 3 `<SkeletonCard />` |
| Error | `<Card>` with error message + "Reintentar" button calling `refetch()` |
| Empty (no trips) | `<Card>` with "No tenés viajes todavía" centered text |
| Data with more | FlatList of `<TripCard>` + "Cargar más" button at bottom |
| Loading more | "Cargar más" replaced by `<ActivityIndicator />` |
| No more pages | FlatList without load-more button |

### Layout

```
┌──────────────────────────────────┐
│  <Navbar title="Historial" />    │
│                                  │
│  ┌────────────────────────────┐  │
│  │  22 jul 2026    Completado │  │
│  │  Av. Corrientes 1200       │  │
│  │         ↓                   │  │
│  │  Av. Santa Fe 1800         │  │
│  │  $4.200,00     Efectivo    │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │  21 jul 2026    Cancelado  │  │
│  │  ...                      │  │
│  └────────────────────────────┘  │
│                                  │
│        [ Cargar más ]            │
│                                  │
└──────────────────────────────────┘
```

### TripCard

Each card shows:
- **Date**: `created_at` formatted as `dd MMM yyyy` (e.g., "22 jul 2026")
- **Status badge**: right-aligned, color-coded
- **Origin → Destination**: origin address on top, arrow, destination below (truncated if needed)
- **Fare**: formatted as currency (`$X.XXX,00`), left-aligned
- **Payment method**: right-aligned next to fare

Wrapper: `<Card>` component with `padding` (existing component).

### Status badge colors

| Status | Badge color | Label |
|--------|------------|-------|
| `completed` | `#4CAF50` (green) | Completado |
| `rated` | `theme.colors.turquoise` | Calificado |
| `in_trip` | `theme.colors.deepBlue` | En viaje |
| `en_route` | `theme.colors.deepBlue` | En ruta |
| `waiting` | `theme.colors.deepBlue` | Esperando |
| `accepted` | `theme.colors.amber` | Aceptado |
| `request_received` | `theme.colors.mediumGray` | Pendiente |
| `cancelled` / `cancelled_early` / `cancelled_late` | `theme.colors.dangerRed` | Cancelado |
| `rejected` | `theme.colors.dangerRed` | Rechazado |

### Navigation entries

1. **EarningsScreen**: Link "Ver historial completo" below the daily trip list, only visible when `earnings.trip_count > 0`
2. **OnlineScreen side menu**: `{ label: 'Historial de viajes', icon: '📋', onPress: () => navigation.navigate('TripHistory') }`
3. **ActiveScreen side menu**: same as above

### Data flow

```ts
const [page, setPage] = useState(1);
const [allTrips, setAllTrips] = useState<Trip[]>([]);

const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['trip-history', page],
  queryFn: async () => {
    const response = await apiClient.get(`/trips/history?page=${page}&limit=20`);
    return response.data.data ?? response.data;
  },
});

// On data change: concatenate to allTrips
useEffect(() => {
  if (data && Array.isArray(data)) {
    setAllTrips(prev => page === 1 ? data : [...prev, ...data]);
  }
}, [data, page]);

const hasMore = data && Array.isArray(data) && data.length === 20;

const loadMore = () => {
  if (hasMore && !isLoading) {
    setPage(prev => prev + 1);
  }
};
```

## Conventions

- Named export: `export const TripHistoryScreen: React.FC = ...`
- Styles at bottom via `StyleSheet.create()`
- All colors/spacing/fonts from `theme.*`
- `useAppNavigation()` hook for navigation
- `StatusBar` component at top
- Follow existing screen patterns (`EarningsScreen`, `PaymentMethodScreen`)

## Testing

- Verify loading skeleton renders 3 cards
- Verify empty state shows "No tenés viajes todavía"
- Verify error state shows retry button
- Verify trip cards render with correct data (date, addresses, fare, payment method, status badge)
- Verify "Cargar más" button appears only when response has 20 items
- Verify navigation from Earnings and side menu works
