---
id: SPEC-auth-supabase-migration
companions:
  - architecture.md
  - affected-files.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate.

# Auth Migration: Supabase as Single Source of Truth

## Why

**Pain to solve.** El backend Lifty tiene dos sistemas de autenticación paralelos que no se comunican. El frontend usa Supabase Auth (login/registro con OTP SMS, JWT de Supabase) y manda ese token al backend como Bearer. Pero el backend tiene su propio auth service interno (`signAccess`, `signRefresh`, `registerPhone`, `login`, etc.) que firma sus propios JWTs con `JWT_SECRET`. Esto genera tres problemas concretos:

1. **El backend no puede verificar los tokens reales del frontend** a menos que `JWT_SECRET` coincida exactamente con el secreto de firma de Supabase. Si no coincide, toda request autenticada devuelve 401.
2. **Todo el código de auth interno es dead code en producción.** Las rutas `/auth/register/*`, `/auth/login`, `/auth/forgot-password`, etc. solo se usan en tests. El otp-store, el password hashing, y el JWT signing interno no tienen propósito real.
3. **Los tests prueban un flujo que nunca corre en producción**, creando una falsa sensación de cobertura. Los tests usan tokens auto-firmados con `signAccess` en vez de tokens de Supabase.

El detonante inmediato fue la revisión de errores e inconsistencias en el auth flow actual, que reveló que estábamos arreglando código que el frontend ni siquiera usa.

## Capabilities

- id: CAP-1
  intent: El backend verifica y acepta exclusivamente JWTs emitidos por Supabase Auth. Si el usuario no existe en la tabla `users` del backend, se crea automáticamente una fila con `id = sub` (UUID de Supabase) y `role = "driver"`.
  success: Una request con un token de Supabase válido resuelve `user` correctamente. Un usuario nuevo que nunca pasó por el backend es auto-creado en `users` en su primera request autenticada.

- id: CAP-2
  intent: Se elimina todo el código de auth interno: registro, login, password hashing, OTP store, JWT signing, refresh token propio, change/reset/forgot password.
  success: `grep -r "signAccess\|signRefresh\|hashPassword\|registerPhone\|registerEmail\|OtpStore\|generateOtp\|buildAuthResponse" src/` no encuentra resultados. `bun test` pasa con 0 fallas.

- id: CAP-3
  intent: Los tests de integración usan tokens firmados con `SUPABASE_JWT_SECRET` en vez de tokens auto-firmados con `JWT_SECRET`.
  success: El helper compartido (`shared/testing/utils.ts`) expone `createTestToken(userId, role)` que firma con `SUPABASE_JWT_SECRET`. Ningún test importa `signAccess` o `signRefresh`.

- id: CAP-4
  intent: Las rutas `/auth/me` y `/auth/logout` se conservan y funcionan con autenticación Supabase.
  success: `GET /api/auth/me` con un token de Supabase devuelve el perfil. `POST /api/auth/logout` revoca los refresh tokens.

- id: CAP-5
  intent: El frontend llama a `POST /api/auth/logout` al cerrar sesión, además de `supabase.auth.signOut()`.
  success: Al hacer logout, los refresh tokens del usuario quedan eliminados del backend.

## Constraints

- **El secreto JWT de Supabase no se hardcodea.** Se lee de `SUPABASE_JWT_SECRET`. `JWT_SECRET` se depreca.
- **No se rompe el frontend existente.** Los endpoints que ya consume (`/api/onboarding/*`, `/api/kyc/*`, `/api/trips/*`, etc.) siguen funcionando con el mismo header `Authorization: Bearer <supabase_token>`.
- **El schema de DB no se modifica.** La tabla `users` se conserva tal cual. `users.id` ahora almacena el UUID de Supabase (`sub` del JWT), creado automáticamente en la primera request autenticada.
- **Supabase Auth no se reemplaza.** El frontend sigue con `supabase.auth.signInWithOtp()`. El backend solo verifica, no emite tokens.

## Non-goals

- No se migra el frontend a usar las rutas `/auth/*` del backend.
- No se unifica el modelo de usuarios entre Supabase y el backend más allá del ID. La tabla `users` del backend sigue siendo la fuente de verdad para perfil (full_name, avatar_url, etc.).
- No se elimina la tabla `refresh_tokens` — se conserva para `/auth/logout`.
- No se toca el WebSocket (`/ws/location`) más allá de adaptar `verifyAccess`.
- No se modifica CI/CD.
- No se implementa sincronización bidireccional Supabase↔backend. Solo se hace upsert en el backend cuando llega un JWT nuevo.

## Success signal

Se levanta el backend con `SUPABASE_JWT_SECRET` configurado, se abre la app Expo, el usuario se registra/loguea con Supabase, y navega por onboarding, perfil, y viajes sin un solo 401. `bun test` corre con 0 fallas y ningún test importa `signAccess` ni `signRefresh`.

## Assumptions

- Supabase Auth está corriendo y accesible desde los entornos de desarrollo y producción.
- El frontend ya envía el `access_token` de Supabase como Bearer (confirmado en `api/client.ts:67-69`).
- El `sub` del JWT de Supabase es un UUID. La tabla `users` usa UUIDs. Son compatibles.
- El rol por defecto para todo usuario nuevo es `"driver"`, que coincide con `users.role.default("driver")` en el schema.
- La tabla `users` tiene columnas `phone` y `email` que pueden ser `null` — el auto-create inicializa solo `id` y `role`; el resto se completa durante el onboarding.
- El `phone` y `email` vienen del JWT de Supabase (`payload.phone`, `payload.email`) o se dejan `null` hasta que el onboarding los complete.
