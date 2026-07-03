# Architecture — Auth Migration to Supabase

## Current Architecture (broken)

```
┌──────────────┐     Supabase JWT      ┌──────────────────────────┐
│  Expo App    │ ───Bearer token──────▶│  Lifty Backend           │
│  (Supabase   │                       │                          │
│   Auth)      │                       │  authPlugin              │
│              │                       │    verifyAccess(token)   │
│  signInWithOtp│                      │    usa JWT_SECRET ❌     │
│  verifyOtp   │                       │    (no es el de Supabase)│
└──────────────┘                       │                          │
                                       │  authService (MUERTO)    │
┌──────────────┐     Token propio      │    signAccess()  💀      │
│  Tests       │ ───firmado con───────▶│    registerPhone() 💀    │
│  (bun:test)  │     JWT_SECRET        │    login()  💀           │
└──────────────┘                       └──────────────────────────┘
```

## Target Architecture

```
┌──────────────┐     Supabase JWT      ┌──────────────────────────┐
│  Expo App    │ ───Bearer token──────▶│  Lifty Backend           │
│  (Supabase   │                       │                          │
│   Auth)      │                       │  authPlugin              │
│              │                       │    verifyAccess(token)   │
│  signInWithOtp│                      │    usa SUPABASE_JWT_     │
│  verifyOtp   │                       │    SECRET ✅             │
└──────────────┘                       │                          │
                                       │  authService             │
┌──────────────┐     Token firmado     │    getMe() ✅            │
│  Tests       │ ───con SUPABASE_─────▶│    logout() ✅           │
│  (bun:test)  │     JWT_SECRET        │                          │
└──────────────┘                       └──────────────────────────┘
```

## Key Decisions

### 1. JWT Verification: de simétrico a simétrico (mismo algoritmo, distinto secreto)

Supabase firma JWTs con HS256 usando su `JWT_SECRET`. El backend actual ya usa HS256. El cambio es solo de secreto: `JWT_SECRET` → `SUPABASE_JWT_SECRET`.

**No se migra a RS256/JWKS** porque Supabase soporta HS256 y es más simple. Si en el futuro se necesita JWKS, se puede cambiar solo `verifyAccess`.

### 2. Role resolution: de JWT claim a DB lookup

**Confirmado:** El authPlugin actual YA resuelve `role` desde `users.role` en la DB, no desde `payload.role`. El JWT de Supabase no necesita claim `role`. Sin cambios en este aspecto.

```typescript
// auth.ts:30-38 — ya hace esto:
.select({ id: users.id, role: users.role, email: users.email, phone: users.phone })
```

### 3. User auto-creation en primera request

**Hallazgo:** El `sub` del JWT de Supabase NO coincide con `users.id` porque el backend genera sus propios UUIDs con `defaultRandom()`. No hay sync entre Supabase y la tabla `users`. El backend nunca llama a Supabase Admin API.

**Solución:** El authPlugin hace upsert en `users` cuando el JWT es válido pero el usuario no existe:

```typescript
// En authPlugin derive:
const [user] = await db.select({...}).from(users).where(eq(users.id, result.payload.sub)).limit(1);

if (!user) {
  // Auto-create: primera vez que este usuario de Supabase toca el backend
  await db.insert(users).values({
    id: result.payload.sub,  // UUID de Supabase
    role: "driver",          // default
    email: (result.payload as any).email ?? null,
    phone: (result.payload as any).phone ?? null,
  });
  // Re-query para obtener el usuario recién creado
  user = await db.select({...}).from(users).where(eq(users.id, result.payload.sub)).limit(1);
}
```

Esto reemplaza completamente a `registerPhone`/`registerEmail`/`registerVerify`. El "registro" ahora es automático: la primera vez que un usuario de Supabase hace una request al backend, se crea su fila en `users`.

### 4. Qué se borra y qué se conserva (actualizado con respuestas confirmadas)

| Símbolo | Archivo | Acción | Motivo |
|---------|---------|--------|--------|
| `signAccess`, `signRefresh` | `shared/lib/jwt.ts` | **Borrar** | El backend no firma más tokens |
| `verifyRefresh` | `shared/lib/jwt.ts` | **Borrar** | `/auth/refresh` se elimina |
| `verifyAccess` | `shared/lib/jwt.ts` | **Modificar** — usar `SUPABASE_JWT_SECRET` | Única verificación necesaria |
| `hashPassword`, `comparePassword`, `validatePasswordStrength` | `shared/lib/password.ts` | **Borrar archivo** | Solo las usaba el auth interno |
| `registerPhone`, `registerEmail`, `registerVerify`, `registerVerifyEmail`, `login` | `features/auth/service.ts` | **Borrar** | Reemplazados por auto-create en authPlugin |
| `forgotPassword`, `resetPassword`, `forgotPasswordEmail`, `resetPasswordEmail`, `changePassword` | `features/auth/service.ts` | **Borrar** | Dead code confirmado — frontend no llama |
| `refreshToken`, `hashToken`, `verifyTokenHash`, `buildAuthResponse`, `parseDuration` | `features/auth/service.ts` | **Borrar** | `/auth/refresh` eliminado |
| `getMe` | `features/auth/service.ts` | **Conservar** | Devuelve perfil desde DB |
| `logout` | `features/auth/service.ts` | **Conservar** | Invalida refresh tokens |
| `OtpStore`, `RedisOtpStore`, `InMemoryOtpStore`, `generateOtp`, `otpStore` | `features/auth/otp-store.ts` | **Borrar archivo** | Sin registro propio, no se necesita |
| Rutas register/login/forgot/reset/change/refresh | `features/auth/routes.ts` | **Borrar** | Dead code confirmado |
| Rutas `/me`, `/logout` | `features/auth/routes.ts` | **Conservar** | Usadas por el frontend |
| Schemas de rutas borradas | `features/auth/schema.ts` | **Borrar** | Sin rutas que las usen |
| `authPlugin` | `shared/middleware/auth.ts` | **Modificar** — agregar auto-create de users | UPSERT en primera request |

### 4. `requireRole` middleware

El middleware `requireRole` en `shared/middleware/roles.ts` accede a `user.role`. Como `AuthUser` ya incluye `role`, y el authPlugin ahora lo resuelve de la DB, este middleware **no requiere cambios**.

## Implementation Order

1. **Cambiar `verifyAccess`** para usar `SUPABASE_JWT_SECRET` en vez de `JWT_SECRET`
2. **Agregar auto-create de `users`** en el authPlugin: si el JWT es válido pero no existe fila en `users`, insertarla con `id = sub` y `role = "driver"`
3. **Borrar código muerto** del auth service, rutas, schemas, otp-store, password.ts, y jwt.ts (signAccess, signRefresh, verifyRefresh)
4. **Actualizar tests** con `createTestToken(userId, role)` que firme con `SUPABASE_JWT_SECRET`
5. **Borrar `refreshToken` flow** (service, ruta, schema, `verifyRefresh`, `hashToken`, `verifyTokenHash`, `buildAuthResponse`)
6. **Borrar `refresh_tokens` fallback del frontend** en `api/client.ts` (línea 118-130)
7. **Agregar `POST /api/auth/logout` al frontend** en `useSignOut`
8. **Actualizar `location/routes.ts`** si el WebSocket usa `verifyAccess`
9. **Limpiar imports y tipos** residuales
