# Affected Files — Auth Migration to Supabase

## Backend: Files to DELETE (entire file)

| File | Reason |
|------|--------|
| `src/features/auth/otp-store.ts` | OTP store solo se usaba para registro interno. Con Supabase, no se necesita. |
| `src/shared/lib/password.ts` | `hashPassword`, `comparePassword`, `validatePasswordStrength` solo las usaba el auth interno. |
| `src/features/auth/auth.test.ts` | Testeaba el flujo de registro/login interno. Se reemplaza por tests que usan tokens de Supabase. |
| `src/features/auth/auth.pbt.test.ts` | Property-based tests del auth interno (si existe). |

## Backend: Files to MODIFY

### `src/shared/lib/jwt.ts`
- **Borrar:** `signAccess`, `signRefresh`, `verifyRefresh`
- **Modificar:** `verifyAccess` → cambiar `getSecret()` para usar `SUPABASE_JWT_SECRET` (con fallback a `JWT_SECRET` para no romper nada durante la transición)
- **Borrar:** `getRefreshSecret()`
- **Conservar:** `TokenPayload`, `VerifyResult`

### `src/shared/middleware/auth.ts`
- **Modificar:** `authPlugin` derive → resolver `role` desde `users.role` en la DB, no desde `payload.role`
- **Modificar:** `AuthUser` → sin cambios estructurales, pero `role` ahora viene de DB
- **Conservar:** `AuthStatus`

### `src/features/auth/service.ts`
- **Borrar:** `registerPhone`, `registerEmail`, `registerVerify`, `registerVerifyEmail`, `login`, `forgotPassword`, `resetPassword`, `forgotPasswordEmail`, `resetPasswordEmail`, `changePassword`, `refreshToken`, `hashToken`, `verifyTokenHash`, `buildAuthResponse`, `parseDuration`
- **Conservar:** `getMe`, `logout`
- **Borrar imports:** `signAccess`, `signRefresh`, `verifyRefresh`, `hashPassword`, `comparePassword`, `validatePasswordStrength`, `sendSms`, `sendEmail`, `otpStore`, `generateOtp`, `ConflictError` (si no se usa en getMe/logout)

### `src/features/auth/routes.ts`
- **Borrar rutas:** `/register/phone`, `/register/verify`, `/register/email`, `/register/verify-email`, `/login`, `/refresh`, `/forgot-password`, `/reset-password`, `/forgot-password-email`, `/reset-password-email`, `/change-password`
- **Conservar rutas:** `/me`, `/logout`
- **Borrar imports:** schemas de rutas borradas, `authService.login`, etc.

### `src/features/auth/schema.ts`
- **Borrar:** `registerPhoneBody`, `registerVerifyBody`, `registerEmailBody`, `registerVerifyEmailBody`, `loginBody`, `refreshBody`, `forgotPasswordBody`, `resetPasswordBody`, `forgotPasswordEmailBody`, `resetPasswordEmailBody`, `changePasswordBody`, `authResponse`
- **Conservar:** `messageResponse`, `meResponse`

### `src/shared/lib/errors.ts`
- **Conservar:** todo (los errores como `UnauthorizedError`, `ConflictError` los siguen usando otras features)

### `src/shared/lib/route-utils.ts`
- **Sin cambios.** `safeCall` se sigue usando en `/me` y `/logout`.

### `src/index.ts`
- **Sin cambios.** `authRoutes` y `authPlugin` se siguen importando/montando igual.

### `src/shared/testing/utils.ts`
- **Agregar:** `createTestToken(userId, role)` que firma un JWT con `SUPABASE_JWT_SECRET` (usando `jose`)
- **Agregar:** `clearOtpKeys` export (ya está)
- **Modificar:** `initTestSuite` para usar `createTestToken` en `registerAndGetToken` o proveer ambas opciones

### `src/features/location/routes.ts`
- **Verificar:** el WebSocket plugin usa `verifyAccess`. Con el cambio de secreto, debería funcionar sin cambios adicionales.

## Backend: Test files that need UPDATES

Todos los archivos de test que usan `registerAndGetToken` o `signAccess` directamente:

| File | Change needed |
|------|---------------|
| `src/all-endpoints.test.ts` | Usar `createTestToken` del helper. Borrar tests de rutas de auth borradas. |
| `src/features/onboarding/onboarding.test.ts` | Usar `createTestToken` en vez de `registerAndGetToken` |
| `src/features/kyc/kyc.test.ts` | Ídem |
| `src/features/drivers/drivers.test.ts` | Ídem. Borrar `import { verifyAccess }` y `userIdFromToken` |
| `src/features/trips/trips.test.ts` | Ídem |
| `src/features/payments/payments.test.ts` | Ídem |
| `src/features/earnings/earnings.test.ts` | Ídem |
| `src/features/ratings/ratings.test.ts` | Ídem |
| `src/features/sos/sos.test.ts` | Ídem |
| `src/features/location/location.test.ts` | Ídem |
| `src/features/notifications/notifications.test.ts` | Ídem |
| `src/features/maps/maps.test.ts` | Ídem |
| `src/features/payment-methods/payment-methods.test.ts` | Ídem |
| `src/features/districts/districts.test.ts` | Ídem |

## Frontend: Files to MODIFY

| File | Change |
|------|--------|
| `src/hooks/useAuth.ts` | Agregar llamada a `POST /api/auth/logout` en `useSignOut` |
| `src/api/client.ts` | Evaluar si el fallback a `/auth/refresh` (línea 120) se puede borrar |

## Files with NO changes

| File | Reason |
|------|--------|
| `src/shared/db/schema/*.ts` | Sin cambios de schema |
| `src/shared/db/client.ts` | Sin cambios |
| `src/shared/lib/logger.ts` | Sin cambios |
| `src/shared/lib/redis.ts` | Sin cambios |
| `src/shared/lib/sms.ts` | Se conserva (lo usa SOS, no solo auth) |
| `src/shared/lib/email.ts` | Se conserva |
| `src/shared/middleware/roles.ts` | Sin cambios |
| `src/shared/middleware/security.ts` | Sin cambios |
| `src/shared/middleware/ratelimit.ts` | Sin cambios |
| `src/shared/middleware/metrics.ts` | Sin cambios |
| `src/shared/middleware/request-id.ts` | Sin cambios |
| `src/shared/lib/metrics.ts` | Sin cambios |
| `src/shared/lib/geo.ts`, `health.ts`, etc. | Sin cambios |
