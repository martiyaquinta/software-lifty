# Fix: WaitingPassengerScreen muestra dirección hardcodeada

**Issue**: #94
**Date**: 2026-07-22
**Labels**: bug, critical, mobile

## Problema

`WaitingPassengerScreen.tsx:152` renderiza una dirección fija `"Av. San Martin 450"` en lugar de la dirección real del viaje activo.

## Solución

Dos cambios en `apps/mobile/src/screens/WaitingPassengerScreen.tsx`:

1. Agregar selector del trip desde el store (junto a los selectores existentes, línea ~38):
   ```tsx
   const trip = useTripStore((s) => s.trip);
   ```

2. Reemplazar la dirección hardcodeada (línea 152):
   ```diff
   - <Text style={styles.address}>en Av. San Martin 450</Text>
   + <Text style={styles.address}>en {trip?.origin_address ?? 'Origen'}</Text>
   ```

## Data flow

`tripStore.trip.origin_address` — poblado en `IncomingRequestScreen` al aceptar el viaje vía `setActiveTrip(trip)` — consumido por selector zustand en `WaitingPassengerScreen`.

## Consistencia con otras pantallas

Mismo patrón ya implementado en:
- `IncomingRequestScreen.tsx:124` — `trip?.origin_address ?? 'Origen'`
- `NavigationScreen.tsx:125` — `trip?.origin_address ?? 'Origen'`

## Riesgos

Ninguno. El `useTripStore` ya está importado. El trip siempre existe al llegar a esta pantalla (flujo garantizado: aceptar viaje → navegación → waiting).
