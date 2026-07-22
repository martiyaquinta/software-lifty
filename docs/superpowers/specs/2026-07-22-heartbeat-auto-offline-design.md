# Heartbeat + Auto-Offline para conductores inactivos

**Issue**: [#95](https://github.com/anomalyco/software-lifty/issues/95)
**Fecha**: 2026-07-22
**Estado**: Spec aprobada, pendiente implementation plan

## Problema

1. El endpoint `PUT /drivers/me/heartbeat` es un no-op — no registra actividad
2. No hay mecanismo que detecte conductores que dejaron de enviar heartbeat
3. Si el celular se queda sin batería o la app crashea, `is_online` queda `true` para siempre

## Diseño

### 1. DB: nueva columna `last_heartbeat`

Agregar `last_heartbeat TIMESTAMPTZ` a la tabla `drivers` (nullable).

**Schema Drizzle** (`src/shared/db/schema/drivers.ts`):
```ts
last_heartbeat: timestamp('last_heartbeat', { withTimezone: true }),
```

**Migration SQL** (`supabase/migrations/<timestamp>_add_last_heartbeat.sql`):
```sql
ALTER TABLE drivers ADD COLUMN last_heartbeat TIMESTAMPTZ;
```

### 2. Heartbeat endpoint funcional

`PUT /api/drivers/me/heartbeat` deja de ser no-op:

1. Resuelve `driver_id` desde el `user` autenticado
2. Si no existe el driver → 404
3. Actualiza en una sola transacción:
   - `drivers.last_heartbeat = NOW()`
   - `driver_locations.updated_at = NOW()`
4. Retorna `{ ok: true }`

**No verifica** `is_online` — el heartbeat es señal de vida del cliente, independientemente del estado online. Si el mobile lo manda, el backend lo registra.

**Archivos**:
- `src/features/drivers/service.ts`: nuevo método `heartbeat(user: AuthUser)`
- `src/features/drivers/routes.ts`: reemplazar el handler no-op por llamada a `driversService.heartbeat(user)`

### 3. Cleanup interval (setInterval en Bun)

Un `setInterval` en el proceso Bun que cada **15 segundos** ejecuta una query de limpieza.

**Condiciones** para marcar `is_online = false`:
- `is_online = true`
- `last_heartbeat < NOW() - INTERVAL '60 seconds'`
- No tiene viaje activo (subquery que excluye drivers con `trips.status` en `'request_received'`, `'accepted'`, `'driver_arrived'`, `'in_progress'`)

**Advisory lock**: `pg_try_advisory_lock(42)` — si hay múltiples instancias, solo una ejecuta la limpieza.

**Arranque/parada**:
- El intervalo se inicia en `index.ts` después del `app.listen()`, solo si `NODE_ENV !== 'test'`
- Se limpia en los handlers de `SIGINT`/`SIGTERM`
- Se exporta una función `startStaleDriverCleanup(intervalMs: number)` y `stopStaleDriverCleanup()`

**Archivos**:
- `src/shared/lib/cleanup.ts`: nuevo módulo con `cleanupStaleDrivers()`, `startStaleDriverCleanup()`, `stopStaleDriverCleanup()`
- `src/index.ts`: importar e iniciar el intervalo

### 4. Threshold

- Mobile envía heartbeat cada **30s**
- Cleanup marca offline después de **60s** sin heartbeat (2 heartbeats perdidos)

Este margen cubre latencia de red y reintentos sin marcar falsos offline.

## Testing

### Tests de heartbeat
- `drivers.test.ts`: testear que `PUT /me/heartbeat` actualiza `last_heartbeat` y `driver_locations.updated_at`
- Caso borde: driver no existe → 404

### Tests de cleanup
- `cleanup.test.ts`: testear la función `cleanupStaleDrivers()`
  - Marca offline a driver con `is_online = true` y `last_heartbeat` > 60s atrás
  - No toca a driver con `is_online = true` y `last_heartbeat` reciente
  - No toca a driver con `is_online = false`
  - No toca a driver que tiene un viaje activo
  - No toca driver sin `last_heartbeat` (nunca envió heartbeat — lo manejamos como caso separado; no lo marca offline porque el mobile pudo no haber llegado a la pantalla Active aún)

## Archivos modificados/creados

| Archivo | Acción |
|---|---|
| `src/shared/db/schema/drivers.ts` | Agregar `last_heartbeat` |
| `supabase/migrations/<ts>_add_last_heartbeat.sql` | Nueva migración |
| `src/features/drivers/routes.ts` | Reemplazar heartbeat no-op |
| `src/features/drivers/service.ts` | Nuevo método `heartbeat(user)` |
| `src/shared/lib/cleanup.ts` | Nuevo: `cleanupStaleDrivers()` + intervalo |
| `src/index.ts` | Iniciar y limpiar el intervalo |
| `src/features/drivers/drivers.test.ts` | Tests de heartbeat endpoint |
| `src/shared/lib/cleanup.test.ts` | Tests de cleanup lógica |

## No scope

- No se modifica el mobile (el intervalo de 30s ya existe)
- No se toca el WebSocket handler (ya funciona para desconexión limpia)
- No se implementa infraestructura de cron jobs genérica (fuera de scope)
