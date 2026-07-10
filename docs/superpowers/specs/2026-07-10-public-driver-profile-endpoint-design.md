# Design: Documentar y endurecer endpoint público GET /drivers/:id/profile

**Issue:** #50
**Fecha:** 2026-07-10
**Severity:** MEDIUM

## Contexto

`GET /api/drivers/:id/profile` (`apps/backend/src/features/drivers/routes.ts:17-23`) es
el único endpoint sin auth de toda la API. Es intencional (perfil público del conductor
para que un pasajero lo vea), pero tiene tres problemas:

1. No está documentado como público en `AGENTS.md` ni en los tags de swagger.
2. Usa el rate limit global (100 req/min por IP) igual que endpoints autenticados.
3. Expone `full_name` completo, scrapeable junto a vehículo, rating y total de viajes.

## Objetivo

Documentar el endpoint como público, aplicarle un rate limit más estricto y reducir la
superficie de datos personales expuestos.

## Decisiones

### 1. Rate limit estricto por-ruta (10 req/min por IP)

El plugin `rateLimit` actual (`apps/backend/src/shared/middleware/ratelimit.ts`) se aplica
globalmente en `index.ts` con `.onBeforeHandle`. Elysia deduplica plugins por `name`, así
que aplicar un segundo `rateLimit` con el mismo nombre no tendría efecto.

**Solución:** parametrizar el plugin para aceptar `name` y `keyPrefix` opcionales:

- Plugin global: `name: 'rate-limit'`, key Redis `ratelimit:ip:<ip>`.
- Plugin público: `name: 'rate-limit-public-profile'`, key `ratelimit:public-profile:ip:<ip>`,
  `max = 10`, `windowMs = 60_000`.

Configurable via env:
- `PUBLIC_PROFILE_RATE_LIMIT_MAX` (default `10`)
- `PUBLIC_PROFILE_RATE_LIMIT_WINDOW_MS` (default `60_000`)

Se aplica **solo** al endpoint `GET /:id/profile`, envolviéndolo en un grupo/guard scoped
dentro de `driversRoutes` para no afectar al resto de rutas del feature.

El store en memoria (fallback sin Redis) también debe usar keys separadas para no compartir
contador con el rate limit global. Se resuelve con el `keyPrefix` distinto.

### 2. Minimizar datos — solo primer nombre

En `driversService.getPublicProfile` (`service.ts:37-74`), en vez de devolver `full_name`
completo, devolver únicamente el primer token:

```ts
const firstName = row.full_name?.split(' ')[0] ?? row.full_name;
// return { ..., full_name: firstName, ... }
```

Se mantiene la clave `full_name` en el payload (para no romper el contrato del cliente),
pero su valor es solo el primer nombre. El resto de campos (`avatar_url`, `rating_avg`,
`total_trips`, `kyc_verified`, `vehicle`) se mantienen: son necesarios para que el pasajero
identifique y confíe en el conductor.

### 3. Documentación

- **Swagger:** agregar `detail` al `.get('/:id/profile', ...)`:
  ```ts
  detail: {
    tags: ['drivers'],
    summary: 'Perfil público del conductor',
    description: 'Endpoint PÚBLICO (sin autenticación). Rate limit: 10 req/min por IP.',
  }
  ```
- **`apps/backend/AGENTS.md`:** nueva sección "Endpoints públicos" documentando:
  - Que este es el único endpoint sin auth.
  - Su rate limit específico (10 req/min por IP).
  - Los campos expuestos y que `full_name` es solo el primer nombre.

## Testing

Archivo: `apps/backend/src/features/drivers/drivers.test.ts`

1. **Actualizar** los 3 tests que esperan `'Juan Perez'` → `'Juan'`:
   - `GET /:id/profile returns public profile` (línea ~90)
   - (los demás que verifican `full_name` en el perfil público)
2. **Agregar** test: exceder 10 requests al endpoint público devuelve `429`.
   - Nota: verificar comportamiento del rate limit en el entorno de test (in-memory store).

## Archivos afectados

- `apps/backend/src/shared/middleware/ratelimit.ts` — parametrizar `name` + `keyPrefix`
- `apps/backend/src/features/drivers/routes.ts` — aplicar rate limit scoped + swagger detail
- `apps/backend/src/features/drivers/service.ts` — primer nombre en `getPublicProfile`
- `apps/backend/src/features/drivers/drivers.test.ts` — actualizar y agregar tests
- `apps/backend/AGENTS.md` — sección endpoints públicos

## Fuera de alcance

- No se quita ningún campo del payload (total_trips se mantiene).
- No se cambia el rate limit global.
- No se agrega auth opcional ni caching.
