# Trip History Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `TripHistoryScreen` in the mobile app displaying all trips with pagination, accessible from Earnings and side menu.

**Architecture:** New screen component + route file + navigation hook entry. No backend changes. Uses `useQuery` with page-based key, FlatList with "Cargar más" button, follows established screen patterns (EarningsScreen, PaymentMethodScreen).

**Tech Stack:** React Native, Expo SDK 56, expo-router, @tanstack/react-query, axios, theme system

## Global Constraints

- All exports must be named (no default exports)
- All colors/spacing/fonts from `theme.*` (never hardcoded)
- Navigation via `useAppNavigation()` hook
- `StyleSheet.create()` at bottom of each file
- Use existing `Card`, `Navbar`, `SkeletonCard` components
- No backend modifications

---

### Task 1: Add TripHistory route to useAppNavigation.ts

**Files:**
- Modify: `apps/mobile/src/hooks/useAppNavigation.ts`

**Interfaces:**
- Produces: `TripHistory` screen name → `/trip-history` route mapping for all tasks that navigate to it

- [ ] **Step 1: Add route entry**

Add `TripHistory: '/trip-history'` to the `SCREEN_TO_ROUTE` object, maintaining alphabetical order after `Terms`:

```ts
const SCREEN_TO_ROUTE = {
  Welcome: '/',
  // ... existing entries ...
  Terms: '/terms',
  TripHistory: '/trip-history',
  UnderReview: '/under-review',
  // ... rest
} as const;
```

- [ ] **Step 2: Run typecheck to verify**

```bash
bun --filter @lifty/mobile run typecheck
```

Expected: PASS (route added correctly)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/useAppNavigation.ts
git commit -m "feat(mobile): add TripHistory route to navigation"
```

---

### Task 2: Create TripHistoryScreen component

**Files:**
- Create: `apps/mobile/src/screens/TripHistoryScreen.tsx`

**Interfaces:**
- Consumes: `SCREEN_TO_ROUTE['TripHistory']` from Task 1
- Consumes: `apiClient` from `../api/client`, `Trip` type, `tripStatusSchema` from `../api/types`
- Consumes: `Card`, `Navbar`, `SkeletonCard` from `../components`
- Consumes: `useAppNavigation` from `../hooks/useAppNavigation`
- Consumes: `theme` from `../theme`
- Produces: `export const TripHistoryScreen: React.FC`

- [ ] **Step 1: Write the screen component**

Create `apps/mobile/src/screens/TripHistoryScreen.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import type { Trip, TripStatus } from '../api/types';
import { Card } from '../components/Card';
import { Navbar } from '../components/Navbar';
import { SkeletonCard } from '../components/feedback/SkeletonCard';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

const LIMIT = 20;

const STATUS_MAP: Record<TripStatus, { label: string; color: string }> = {
  completed: { label: 'Completado', color: '#4CAF50' },
  rated: { label: 'Calificado', color: theme.colors.turquoise },
  in_trip: { label: 'En viaje', color: theme.colors.deepBlue },
  en_route: { label: 'En ruta', color: theme.colors.deepBlue },
  waiting: { label: 'Esperando', color: theme.colors.deepBlue },
  accepted: { label: 'Aceptado', color: theme.colors.amber },
  request_received: { label: 'Pendiente', color: theme.colors.mediumGray },
  cancelled: { label: 'Cancelado', color: theme.colors.dangerRed },
  cancelled_early: { label: 'Cancelado', color: theme.colors.dangerRed },
  cancelled_late: { label: 'Cancelado', color: theme.colors.dangerRed },
  rejected: { label: 'Rechazado', color: theme.colors.dangerRed },
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatCurrency = (amount: number) =>
  `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortAddress = (address: string) => {
  const parts = address.split(',');
  return parts.length > 1 ? parts[0].trim() : address;
};

const paymentLabel = (method: string | null) => {
  if (!method) return '—';
  if (method === 'cash') return 'Efectivo';
  if (method === 'transfer') return 'Transferencia';
  return method;
};

interface TripCardProps {
  trip: Trip;
}

const TripCard: React.FC<TripCardProps> = ({ trip }) => {
  const statusInfo = STATUS_MAP[trip.status as TripStatus];

  return (
    <Card style={styles.tripCard} padding={theme.spacing.md}>
      <View style={styles.tripHeader}>
        <Text style={styles.tripDate}>{formatDate(trip.created_at)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
          <Text style={styles.statusText}>{statusInfo.label}</Text>
        </View>
      </View>
      <View style={styles.tripAddress}>
        <Text style={styles.tripAddressText} numberOfLines={1}>
          {trip.origin_address ? shortAddress(trip.origin_address) : '—'}
        </Text>
        <Text style={styles.tripArrow}>↓</Text>
        <Text style={styles.tripAddressText} numberOfLines={1}>
          {trip.dest_address ? shortAddress(trip.dest_address) : '—'}
        </Text>
      </View>
      <View style={styles.tripFooter}>
        <Text style={styles.tripFare}>{formatCurrency(trip.total_fare ?? 0)}</Text>
        <Text style={styles.tripPayment}>{paymentLabel(trip.payment_method)}</Text>
      </View>
    </Card>
  );
};

export const TripHistoryScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const [page, setPage] = useState(1);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);

  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<Trip[]>({
    queryKey: ['trip-history', page],
    queryFn: async () => {
      const response = await apiClient.get(`/trips/history?page=${page}&limit=${LIMIT}`);
      return response.data.data ?? response.data;
    },
  });

  useEffect(() => {
    if (data && Array.isArray(data)) {
      setAllTrips((prev) => (page === 1 ? data : [...prev, ...data]));
    }
  }, [data, page]);

  const hasMore = Array.isArray(data) && data.length === LIMIT;
  const isInitialLoading = isLoading && page === 1;
  const isRefreshingMore = (isFetching && page > 1) || (isLoading && page > 1);

  const loadMore = () => {
    if (hasMore && !isFetching) {
      setPage((prev) => prev + 1);
    }
  };

  const renderFooter = () => {
    if (isRefreshingMore) {
      return (
        <View style={styles.loadMoreContainer}>
          <ActivityIndicator size="small" color={theme.colors.turquoise} />
        </View>
      );
    }
    if (hasMore && allTrips.length > 0) {
      return (
        <TouchableOpacity
          style={styles.loadMoreButton}
          activeOpacity={0.7}
          onPress={loadMore}
        >
          <Text style={styles.loadMoreText}>Cargar mas</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  const renderContent = () => {
    if (isInitialLoading) {
      return (
        <View style={styles.content}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.content}>
          <Card style={styles.errorCard} padding={theme.spacing.lg}>
            <Text style={styles.errorText}>No se pudo cargar</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </Card>
        </View>
      );
    }

    if (allTrips.length === 0) {
      return (
        <View style={styles.content}>
          <Card style={styles.emptyCard} padding={theme.spacing.lg}>
            <Text style={styles.emptyText}>No tenes viajes todavia</Text>
          </Card>
        </View>
      );
    }

    return (
      <FlatList
        data={allTrips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TripCard trip={item} />}
        contentContainerStyle={styles.content}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Historial" onBack={() => navigation.goBack()} showBack />
      {renderContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
  },
  content: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  tripCard: {
    width: 343,
    gap: theme.spacing.sm,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripDate: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  statusText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
  tripAddress: {
    gap: 2,
    marginTop: 2,
  },
  tripAddressText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
  },
  tripArrow: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    textAlign: 'center',
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  tripFare: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
  },
  tripPayment: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
  loadMoreContainer: {
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  loadMoreButton: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.buttonRadius,
    backgroundColor: theme.colors.deepBlue,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
  },
  loadMoreText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.white,
  },
  errorCard: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.dangerRed,
  },
  retryText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.turquoise,
    fontWeight: theme.fontWeight.medium,
  },
  emptyCard: {
    alignItems: 'center',
  },
  emptyText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
  },
});
```

- [ ] **Step 2: Run typecheck**

```bash
bun --filter @lifty/mobile run typecheck
```

Expected: PASS (no type errors)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/TripHistoryScreen.tsx
git commit -m "feat(mobile): add TripHistoryScreen component"
```

---

### Task 3: Create route re-export file

**Files:**
- Create: `apps/mobile/app/trip-history.tsx`

**Interfaces:**
- Consumes: `TripHistoryScreen` from `../src/screens/TripHistoryScreen` (Task 2)

- [ ] **Step 1: Create route file**

Create `apps/mobile/app/trip-history.tsx`:

```tsx
export { TripHistoryScreen as default } from '../src/screens/TripHistoryScreen';
```

- [ ] **Step 2: Run typecheck**

```bash
bun --filter @lifty/mobile run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/trip-history.tsx
git commit -m "feat(mobile): add trip-history route file"
```

---

### Task 4: Add "Ver historial completo" link in EarningsScreen

**Files:**
- Modify: `apps/mobile/src/screens/EarningsScreen.tsx`

**Interfaces:**
- Consumes: `TripHistory` route from Task 1

- [ ] **Step 1: Add history link below trip list**

In `EarningsScreen.tsx`, inside the `{earnings.trips && earnings.trips.length > 0 && (` block, after the closing `</Card>` of the trip list, add:

```tsx
{earnings.trips && earnings.trips.length > 0 && (
  <>
    <Card>
      <Text style={styles.cardTitle}>Viajes de hoy</Text>
      {earnings.trips.map((trip) => (
        <View key={trip.id} style={styles.tripRow}>
          <View style={styles.tripLeft}>
            <Text style={styles.tripTime}>{formatTime(trip.created_at)}</Text>
            <Text style={styles.tripOrigin} numberOfLines={1}>
              {shortAddress(trip.origin_address ?? '')}
            </Text>
          </View>
          <View style={styles.tripRight}>
            <Text style={styles.tripAmount}>{formatCurrency(trip.total_fare ?? 0)}</Text>
            <Text style={styles.tripRetention}>
              Retencion -{formatCurrency(trip.platform_fee ?? 0)}
            </Text>
            <Text style={styles.tripNet}>
              Recibis {formatCurrency(trip.driver_earnings ?? 0)}
            </Text>
          </View>
        </View>
      ))}
    </Card>
    <TouchableOpacity
      style={styles.historyLink}
      onPress={() => navigation.navigate('TripHistory')}
      activeOpacity={0.7}
    >
      <Text style={styles.historyLinkText}>Ver historial completo →</Text>
    </TouchableOpacity>
  </>
)}
```

- [ ] **Step 2: Add the historyLink styles at the bottom of the StyleSheet**

```ts
historyLink: {
  paddingVertical: theme.spacing.sm,
  alignItems: 'center',
},
historyLinkText: {
  fontSize: theme.fontSize.sm,
  fontWeight: theme.fontWeight.medium,
  color: theme.colors.turquoise,
},
```

- [ ] **Step 3: Run typecheck**

```bash
bun --filter @lifty/mobile run typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/EarningsScreen.tsx
git commit -m "feat(mobile): add trip history link in EarningsScreen"
```

---

### Task 5: Add side menu item in OnlineScreen

**Files:**
- Modify: `apps/mobile/src/screens/OnlineScreen.tsx`

**Interfaces:**
- Consumes: `TripHistory` route from Task 1

- [ ] **Step 1: Add menu item before "Cerrar sesion"**

In the `menuItems` array, add the TripHistory item before "Cerrar sesion":

```ts
const menuItems = useMemo(
  () => [
    {
      label: 'Inicio',
      icon: '🏠',
      onPress: () => {
        if (isOnline) {
          navigation.navigate('Active');
        }
      },
    },
    {
      label: 'Ganancias',
      icon: '💰',
      onPress: () => navigation.navigate('Earnings'),
    },
    {
      label: 'Metodo de cobro',
      icon: '💳',
      onPress: () => navigation.navigate('PaymentMethod'),
    },
    {
      label: 'Perfil',
      icon: '👤',
      onPress: () => navigation.navigate('Profile'),
    },
    {
      label: 'Historial de viajes',
      icon: '📋',
      onPress: () => navigation.navigate('TripHistory'),
    },
    {
      label: 'Cerrar sesion',
      icon: '🚪',
      onPress: () => signOut.mutateAsync(),
      danger: true,
      dividerTop: true,
    },
  ],
  [navigation, signOut, isOnline],
);
```

- [ ] **Step 2: Run typecheck**

```bash
bun --filter @lifty/mobile run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/OnlineScreen.tsx
git commit -m "feat(mobile): add trip history to OnlineScreen side menu"
```

---

### Task 6: Add side menu item in ActiveScreen

**Files:**
- Modify: `apps/mobile/src/screens/ActiveScreen.tsx`

**Interfaces:**
- Consumes: `TripHistory` route from Task 1

- [ ] **Step 1: Add menu item before "Cerrar sesion"**

In the `menuItems` array, add the TripHistory item:

```ts
const menuItems = useMemo(
  () => [
    {
      label: 'Inicio',
      icon: '🏠',
      onPress: () => {},
    },
    {
      label: 'Ganancias',
      icon: '💰',
      onPress: () => navigation.navigate('Earnings'),
    },
    {
      label: 'Metodo de cobro',
      icon: '💳',
      onPress: () => navigation.navigate('PaymentMethod'),
    },
    {
      label: 'Perfil',
      icon: '👤',
      onPress: () => navigation.navigate('Profile'),
    },
    {
      label: 'Historial de viajes',
      icon: '📋',
      onPress: () => navigation.navigate('TripHistory'),
    },
    {
      label: 'Cerrar sesion',
      icon: '🚪',
      onPress: () => signOut.mutateAsync(),
      danger: true,
      dividerTop: true,
    },
  ],
  [navigation, signOut],
);
```

- [ ] **Step 2: Run typecheck**

```bash
bun --filter @lifty/mobile run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/ActiveScreen.tsx
git commit -m "feat(mobile): add trip history to ActiveScreen side menu"
```

---

### Task 7: Final verification and PR

- [ ] **Step 1: Run full lint + typecheck**

```bash
bun run check
```

Expected: PASS (no lint errors, no type errors)

- [ ] **Step 2: Run tests**

```bash
bun run test
```

Expected: PASS (no regressions)

- [ ] **Step 3: Push branch**

```bash
git push -u origin feature/trip-history-screen-98
```

- [ ] **Step 4: Create PR**

```bash
gh pr create --title "feat(mobile): add trip history screen (resolves #98)" --body "## Summary

Adds TripHistoryScreen showing all trips with status badges, pagination via 'Cargar más' button.

### Changes
- New screen: \`TripHistoryScreen\` consuming \`GET /trips/history\`
- Pagination via \`?page=&limit=20\`, auto-hides load-more when no more items
- Status badges with color-coded labels for all trip states
- Link from EarningsScreen ('Ver historial completo')
- Side menu entry in OnlineScreen and ActiveScreen

### Files
- **Create**: \`TripHistoryScreen.tsx\`, \`app/trip-history.tsx\`
- **Modify**: \`useAppNavigation.ts\`, \`EarningsScreen.tsx\`, \`OnlineScreen.tsx\`, \`ActiveScreen.tsx\`

Closes #98"
```

Expected: PR URL returned
