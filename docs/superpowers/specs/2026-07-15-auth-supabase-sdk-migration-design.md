---
id: auth-supabase-sdk-migration
created: 2026-07-15
status: draft
---

# Auth Migration: Supabase Auth SDK (clean cut)

## Why

El backend Lifty tiene un sistema de auth propio (email/password, JWT HS256 firmado con `JWT_SECRET`, refresh tokens en DB, `Bun.password` hashing, verificacion de email con Resend) que ya no se usa. El frontend migro completamente a Supabase Auth (`supabase.auth.signUp`, `signInWithPassword`, `verifyOtp`, etc.) y el backend ya tiene compatibilidad dual via `verifyAccess`. Esto deja ~600 lineas de codigo muerto en el backend que son una ilusion de control y distraen del MVP.

**Objetivo:** eliminar TODO el auth propio del backend y delegar completamente a Supabase Auth usando el SDK (`supabase.auth.getUser`).

## Architecture

```
┌──────────────┐                          ┌──────────────────────────────┐
│  Expo App    │                          │  Lifty Backend               │
│              │                          │                              │
│  Supabase    │   Bearer <supabase_JWT>  │  authPlugin                  │
│  Auth SDK    │ ────────────────────────►│    supabase.auth.getUser()   │
│              │                          │    ↓                         │
│  signUp /    │                          │    busca/crea row en users   │
│  signIn /    │                          │    ↓                         │
│  signOut     │                          │    inyecta { user }          │
│              │                          │                              │
└──────────────┘                          │  authRoutes                  │
                                          │    GET  /auth/me             │
                                          │    POST /auth/logout         │
                                          │                              │
                                          │  NO: register, login,        │
                                          │  verify, refresh, reset,     │
                                          │  password signing,           │
                                          │  refresh_tokens table        │
                                          └──────────────────────────────┘
```

**Request flow:**
1. Mobile envia `Authorization: Bearer <supabase_jwt>`
2. `authPlugin` llama a `supabase.auth.getUser(jwt)` — si es invalido/expirado, 401
3. Busca `sub` en `users`. Si no existe, lo auto-crea con `id = sub, role = 'driver'`
4. Inyecta `{ user: AuthUser, authStatus }` en el contexto Elysia
5. Las rutas protegidas con `requireAuth: true` reciben `user` sin cambios

## Capabilities

### CAP-1: Eliminar auth propio del backend
Se borra todo el codigo de auth interno: firma JWT, password hashing, registro, login, verificacion, refresh tokens, revocacion de access tokens. El unico auth es Supabase.
**Success:** `bun test` pasa con 0 fallas. No existen `signAccess`, `signRefresh`, `hashPassword`, ni `JWT_SECRET` en el codigo.

### CAP-2: authPlugin via supabase.auth.getUser()
El middleware de auth usa exclusivamente `supabase.auth.getUser(token)` del SDK para validar sesiones. Cero secretos JWT que manejar, cero JWKS que monitorear.
**Success:** Un token valido de Supabase autentica correctamente. Un token expirado/invalido devuelve 401 con `TOKEN_EXPIRED` o `TOKEN_INVALID`.

### CAP-3: Migracion limpia de schema
Se dropean todas las columnas y tablas de auth propio de la DB.
**Success:** `users` no tiene `password_hash`, `verification_code`, `reset_code`, ni columnas relacionadas. La tabla `refresh_tokens` no existe.

### CAP-4: API keys migradas al nuevo formato
Se reemplazan las legacy API keys de Supabase (JWT `anon`/`service_role`) por las nuevas (`sb_publishable_*`/`sb_secret_*`).
**Success:** Backend y mobile usan las nuevas keys. Las legacy keys no aparecen en `.env` ni `.env.example`.

### CAP-5: Tests independientes de Supabase
Los tests no requieren conexion a Supabase Auth. Usan dependency injection en el authPlugin para mockear `getUser`.
**Success:** `createTestToken(userId)` retorna un string simple. Los tests corren offline (solo necesitan PostgreSQL + Redis).

## Files to DELETE

| File | Reason |
|------|--------|
| `shared/lib/jwt.ts` | `signAccess`, `signRefresh`, `verifyAccess`, `revokeAccess`, `isAccessRevoked`, `tryVerify`, `getSupabaseJwks`, `getBackendSecret`, `getSupabaseSecret`, `hashToken` — todo reemplazado por `supabase.auth.getUser()` |
| `shared/db/schema/refresh-tokens.ts` | Tabla obsoleta, Supabase gestiona sus propios refresh tokens |

## Files to MODIFY

### Backend source

| File | Changes |
|------|---------|
| `shared/middleware/auth.ts` | Reescribir. `createAuthPlugin(resolveUser?)` con dependency injection. Crea un cliente Supabase con `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (mismo patron lazy-init que `storage.ts`). En prod usa `supabase.auth.getUser()`, auto-crea `users` rows. |
| `shared/middleware/require-auth.ts` | Sin cambios logicos (sigue consumiendo `user` del authPlugin). |
| `features/auth/service.ts` | Conservar solo `getMe` y `logout`. `logout` pasa a ser no-op (Supabase maneja el cierre de sesion). Borrar: `register`, `verifyEmail`, `resendCode`, `forgotPassword`, `resetPassword`, `login`, `refreshToken`, `normalizeEmail`, `generateCode`, `logCodeForDev`, y todas las constantes de auth. |
| `features/auth/routes.ts` | Conservar solo `GET /me` y `POST /logout`. Borrar el resto de rutas y schemas de body. |
| `features/auth/schema.ts` | Conservar solo `messageResponse` y `meResponse`. Borrar `registerBody`, `verifyEmailBody`, `loginBody`, `refreshBody`, `emailOnlyBody`, `resetPasswordBody`, `registerResponse`, `verifyResponse`, `loginResponse`, `refreshResponse`. |
| `shared/lib/storage.ts` | Cambiar `SUPABASE_SERVICE_KEY` → `SUPABASE_SECRET_KEY`. |
| `features/location/routes.ts` | El handler WebSocket `open()` llama a `verifyAccess(token)` directamente. Cambiar a `supabase.auth.getUser(token)` + lookup en `users` por `sub`. Misma logica que el authPlugin HTTP. |
| `shared/db/schema/users.ts` | Borrar columnas: `password_hash`, `verification_code`, `verification_code_expires_at`, `verification_attempts`, `reset_code`, `reset_code_expires_at`, `reset_attempts`, `email_verified`. |
| `shared/db/schema/index.ts` | Quitar export de `refreshTokens`. |
| `src/index.ts` | `validateEnv()`: sacar `JWT_SECRET` de required, agregar `SUPABASE_URL` (antes solo se validaba implicitamente para JWKS en jwt.ts; ahora es fundamental para el authPlugin). Actualizar swagger tags (fuera JWT, "auth" solo `/me` y `/logout`). |
| `shared/testing/utils.ts` | Reescribir `createTestToken(userId)` — retorna `userId` directamente (el token ES el userId en modo test). Agregar `createTestAuthPlugin()` que mockea `getUser` via DB lookup. |
| `shared/testing/setup.ts` | Quitar `JWT_SECRET` del `process.env`. |

### Backend tests

| File | Changes |
|------|---------|
| `all-endpoints.test.ts` | Borrar todas las rutas de auth (register, verify, resend-code, forgot-password, reset-password, login, refresh). Actualizar `truncateAll` (fuera `DELETE FROM refresh_tokens`). El helper `register()` ya hace insert directo + `createTestToken` — solo requiere quitar `password_hash: 'unused'` del insert y migrar a `createTestToken` nuevo (token = userId). |
| `shared/middleware/auth.test.ts` | Reescribir completamente para el nuevo authPlugin con mock de `getUser`. |
| `shared/middleware/require-auth.test.ts` | Quitar `JWT_SECRET` y `SignJWT`. Usar `createTestToken`. |
| `features/auth/logout.test.ts` | Actualizar: sin `JWT_SECRET`, sin `refreshTokens`, sin `signAccess`. |
| `features/onboarding/onboarding.test.ts` | `registerAndGetToken` → `createTestToken` + insert de usuario en DB. Quitar `JWT_SECRET`. |
| `features/kyc/kyc.test.ts` | Idem. |
| `features/drivers/drivers.test.ts` | Idem. |
| `features/trips/trips.test.ts` | Idem. Quitar `DELETE FROM refresh_tokens`. |
| `features/trips/trips.race.test.ts` | Idem. |
| `features/payments/payments.test.ts` | Idem. |
| `features/earnings/earnings.test.ts` | Idem. |
| `features/ratings/ratings.test.ts` | Idem. |
| `features/sos/sos.test.ts` | Idem. |
| `features/location/location.test.ts` | Idem. Ademas verificar que el WS `open` usa el nuevo metodo de auth. |
| `features/notifications/notifications.test.ts` | Idem. |
| `features/maps/maps.test.ts` | Idem. |
| `features/payment-methods/payment-methods.test.ts` | Idem. |
| `features/districts/districts.test.ts` | Idem. |
| `features/admin/admin.test.ts` | Idem. |

### Scripts and config

| File | Changes |
|------|---------|
| `scripts/dev-setup.ts` | Quitar generacion de `JWT_SECRET`, `JWT_REFRESH_SECRET`. Agregar `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` al template. |
| `scripts/generate-secrets.ts` | Quitar `JWT_SECRET`, `JWT_REFRESH_SECRET`. |
| `docker-compose.yml` | Quitar `JWT_SECRET`, `JWT_REFRESH_SECRET`. Agregar `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. |
| `turbo.json` | Quitar `JWT_SECRET` del `env` del task `test`. |
| `../.github/workflows/ci.yml` | Quitar `JWT_SECRET` de env vars del job `test` (~linea 85). |
| `AGENTS.md` | Actualizar seccion de Auth. |

### Environment files

| File | Changes |
|------|---------|
| `backend/.env.example` | Quitar `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES`, `JWT_REFRESH_EXPIRES`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_KEY`. Agregar `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. |
| `backend/.env.production.example` | Idem, mas quitar `BCRYPT_COST`. |
| `backend/.env` | Idem (actualizar valores reales). |
| `backend/.env.enc.yml` | Idem (re-encriptar con sops). |
| `mobile/.env` | `EXPO_PUBLIC_SUPABASE_ANON_KEY` → `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. |
| `mobile/.env.example` | Idem. |
| `mobile/.env.enc.yml` | Idem. |

### Docs

| File | Changes |
|------|---------|
| `backend/AGENTS.md` | Actualizar seccion de Auth: describir Supabase-only, quitar endpoints eliminados. |
| `backend/README.md` | Actualizar tabla de env vars. |
| `docs/vault/01 - PROYECTO/Decisiones.md` | Actualizar: "Auth: JWT propio (migrando...)" → "Auth: Supabase Auth SDK". |

## Schema migration

```sql
ALTER TABLE users
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS verification_code,
  DROP COLUMN IF EXISTS verification_code_expires_at,
  DROP COLUMN IF EXISTS verification_attempts,
  DROP COLUMN IF EXISTS reset_code,
  DROP COLUMN IF EXISTS reset_code_expires_at,
  DROP COLUMN IF EXISTS reset_attempts,
  DROP COLUMN IF EXISTS email_verified;

DROP TABLE IF EXISTS refresh_tokens;
```

## Env var changes

```diff
BACKEND:
- JWT_SECRET
- JWT_REFRESH_SECRET
- JWT_ACCESS_EXPIRES
- JWT_REFRESH_EXPIRES
- BCRYPT_COST (solo .env.production.example)
- SUPABASE_JWT_SECRET
- SUPABASE_SERVICE_KEY (legacy JWT, obsoleto)
+ SUPABASE_URL (debe estar en docker-compose.yml tambien)
+ SUPABASE_PUBLISHABLE_KEY (sb_publishable_...)
+ SUPABASE_SECRET_KEY (sb_secret_..., para storage/admin)

MOBILE:
- EXPO_PUBLIC_SUPABASE_ANON_KEY (legacy JWT, obsoleto)
+ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_...)
```

## Test token strategy

El authPlugin usa dependency injection para permitir tests sin Supabase:

```typescript
// shared/middleware/auth.ts
export function createAuthPlugin(
  resolveUser?: (token: string) => Promise<AuthUser | null>
) {
  const getUser = resolveUser ?? realSupabaseGetUser;

  return new Elysia({ name: 'auth' }).derive(async ({ request }) => {
    const header = request.headers.get('authorization');
    if (!header?.startsWith('Bearer ')) {
      return { user: null, authStatus: 'no_token' as const };
    }
    const user = await getUser(header.slice(7));
    if (!user) return { user: null, authStatus: 'token_invalid' as const };
    return { user, authStatus: 'authenticated' as const };
  });
}
```

```typescript
// shared/testing/utils.ts
export function createTestToken(userId: string): string {
  return userId; // El token ES el userId en modo test
}

export function createTestAuthPlugin() {
  return createAuthPlugin(async (token) => {
    const [user] = await db.select().from(users).where(eq(users.id, token)).limit(1);
    return (user as AuthUser) ?? null;
  });
}
```

Los tests usan `createTestAuthPlugin()` en vez de `authPlugin` al construir la app de prueba. `createTestToken(userId)` inserta el usuario en la DB y retorna el ID como "token".

## Constraints

- **No se rompe el frontend.** El mobile ya usa Supabase Auth. Los endpoints que consume (`/api/onboarding/*`, `/api/kyc/*`, `/api/trips/*`, etc.) siguen funcionando con `Bearer <supabase_token>`.
- **Tests corren offline.** No requieren Supabase Auth corriendo (solo PostgreSQL + Redis).
- **`users.id` usa UUIDs de Supabase.** Coinciden con `sub` del JWT. Sin cambios en el tipo de la columna.
- **El authPlugin auto-crea usuarios.** Si el `sub` no existe en `users`, inserta `{ id: sub, email, phone, role: 'driver' }`. El resto se completa en onboarding.
- **`/auth/logout` es no-op.** Supabase maneja el cierre de sesion. Se conserva la ruta por compatibilidad (mobile la llama best-effort).

## Non-goals

- No se migra el frontend (ya esta migrado).
- No se modifica la logica del WebSocket (`/ws/location`), solo su metodo de verificacion de token (`verifyAccess` → `supabase.auth.getUser`).
- No se modifica CI/CD (solo se limpia `JWT_SECRET` huerfano de `ci.yml` y `turbo.json` — sin cambios funcionales).
- No se implementa admin SDK de Supabase en esta fase (solo `getUser` con publishable key).
- No se toca `shared/lib/email.ts` (lo sigue usando onboarding y notificaciones).
- No se toca `shared/lib/redis.ts` (sigue para rate limiting y cache).

## Success signal

Se levanta el backend con `SUPABASE_PUBLISHABLE_KEY` configurado. `bun test` pasa con 0 fallas. `bun run typecheck` y `bun run lint` limpios. La app mobile funciona sin cambios: login, onboarding, perfil, viajes — sin un solo 401.
