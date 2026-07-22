# Driver locations cleanup (#99)

## Problem

Cuando un conductor se desconecta (manual via `toggleOnline`, WebSocket close, o heartbeat stale), su fila en `driver_locations` queda intacta. Cualquier query futura que busque conductores cercanos sin filtrar `drivers.is_online = true` incluiria conductores offline.

Ademas, la tabla `driver_locations` acumula filas indefinidamente sin ningun mecanismo de limpieza.

### Donde ocurre

- `apps/backend/src/features/location/service.ts:23-41` — `upsertLocation()` solo hace upsert, nunca borra
- `apps/backend/src/features/location/service.ts:16-21` — `markDriverOffline()` (WebSocket close) solo setea `drivers.is_online = false`
- `apps/backend/src/features/drivers/service.ts:179-218` — `toggleOnline(false)` solo setea `drivers.is_online = false`
- `apps/backend/src/shared/lib/cleanup.ts:46-49` — `cleanupStaleDrivers()` solo setea `drivers.is_online = false`

## Design

### 1. Funcion centralizada `findNearbyOnlineDrivers(lat, lng, radiusKm)`

Nueva funcion exportada en `apps/backend/src/features/location/service.ts` que hace JOIN `driver_locations` + `drivers` con filtro `is_online = true`. Usa la formula de Haversine en SQL para calcular distancia dentro del radio.

Es la **unica puerta de entrada canonica** para cualquier feature que necesite buscar conductores cercanos. No se hacen SELECTs directos a `driver_locations` desde ningun otro lado.

Firma:
```ts
export async function findNearbyOnlineDrivers(
  lat: number, lng: number, radiusKm: number
): Promise<Array<{ driver_id: string; lat: number; lng: number; heading: number | null }>>
```

### 2. Cleanup de ubicaciones stale (parte de `cleanupStaleDrivers`)

Extender `cleanupStaleDrivers()` en `apps/backend/src/shared/lib/cleanup.ts` para que, despues de marcar offline a los drivers sin heartbeat, **borre** de `driver_locations` las filas cuyo `updated_at` tenga mas de 24 horas.

Dos queries independientes dentro del mismo advisory lock:
1. Marcar `drivers.is_online = false` (ya existe hoy)
2. `DELETE FROM driver_locations WHERE updated_at < NOW() - INTERVAL '24 hours'` (nuevo)

Esto evita que `driver_locations` crezca indefinidamente sin afectar las queries de conductores online (que ya filtran por `is_online = true`).

### Reglas

- Las queries que buscan conductores cercanos **siempre** hacen JOIN con `drivers` y filtran `is_online = true` mediante `findNearbyOnlineDrivers()`
- `upsertLocation`, `markDriverOffline`, `toggleOnline`, `heartbeat` **no se modifican** — siguen su comportamiento actual
- El cleanup de 24h es conservador: un conductor que esta offline <24h no pierde su ubicacion, por si se necesita para debug o analytics
- No hay cambios de schema ni migraciones

## Files changed

- `apps/backend/src/features/location/service.ts` — nueva funcion `findNearbyOnlineDrivers`
- `apps/backend/src/shared/lib/cleanup.ts` — extender `cleanupStaleDrivers` con DELETE de `driver_locations` stale
- `apps/backend/src/features/location/location.test.ts` — tests para `findNearbyOnlineDrivers`
- `apps/backend/src/shared/lib/cleanup.test.ts` — tests para el nuevo DELETE de locations
- `apps/backend/src/features/location/service.ts` — re-export `findNearbyOnlineDrivers` desde `routes.ts` si se necesita
