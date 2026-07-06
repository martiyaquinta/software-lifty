---
id: SPEC-auth-supabase-migration
companions:
  - architecture.md
  - affected-files.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate.

# Auth Migration: Supabase as Single Source of Truth (phased)

## Why

**Pain to solve.** Lifty tiene dos sistemas de auth que no conversan, y la app depende del equivocado:

- **Backend**: auth propio por email/password. Registra usuarios, envía código de verificación por email (Resend), emite JWTs HS256 firmados con `JWT_SECRET` (`signAccess`), y maneja refresh tokens propios en la tabla `refresh_tokens`.
- **Frontend (mobile)**: usa **exclusivamente** ese auth de backend. Las pantallas Register/LoginCredentials/LoginOTP/ForgotPassword llaman a `/auth/register`, `/auth/verify`, `/auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`. **Supabase Auth está apagado** en `lib/supabase.ts` (`persistSession: false`, `autoRefreshToken: false`, `storage: undefined`). Supabase solo se usa para realtime channels y chat.

El objetivo estratégico (registrado en `Decisiones.md`) sigue siendo: **Supabase Auth como única fuente de verdad**, eliminando la dualidad. Pero la migración NO puede ser un big-bang: si se borra el auth de backend antes de migrar el frontend, la app queda 100% rota (llama a endpoints que ya no existen y no tiene flujo Supabase de reemplazo).

> **Corrección de la spec original (2026-07-06).** La versión previa asumía que el frontend "ya envía el access_token de Supabase como Bearer" y usaba `supabase.auth.signInWithOtp()`. **Eso nunca fue cierto.** El frontend usa auth de backend por email/password. El PR #29 (big-bang) se cerró por este motivo. Esta versión reemplaza el big-bang por un plan de 3 fases.

## Phases

### Phase 1 — Backend acepta ambas fuentes de JWT (NO rompe nada) ← objetivo de este ciclo
El backend verifica tokens firmados con `SUPABASE_JWT_SECRET` **o** con `JWT_SECRET`. Se conserva todo el auth interno (register/login/refresh/etc.). El authPlugin auto-crea la fila en `users` cuando llega un `sub` desconocido. Esto habilita que Supabase tokens funcionen **sin romper** el flujo de email/password actual.

### Phase 2 — Frontend migra a Supabase Auth
Se habilita Supabase Auth en el cliente (`persistSession`, `autoRefreshToken`, storage AsyncStorage). Se reescriben las pantallas de auth para usar `supabase.auth.signUp` / `signInWithPassword` / `resetPasswordForEmail`. `authStore` sincroniza con la sesión de Supabase. `api/client.ts` toma el token de la sesión y refresca con `supabase.auth.refreshSession()`.

### Phase 3 — Backend borra el auth interno muerto
Una vez que el frontend ya no llama a `/auth/register|login|refresh|verify|forgot-password|reset-password`, se borra ese código muerto (`signAccess`, `signRefresh`, `hashToken`, register/login/forgot/reset/change, otp-store, password.ts) y los tests se migran a `createTestToken` con `SUPABASE_JWT_SECRET`.

## Capabilities

- id: CAP-1
  phase: 1
  intent: El backend verifica JWTs firmados con `SUPABASE_JWT_SECRET` con prioridad, y cae a `JWT_SECRET` si el primero falla o no está configurado. Un token válido de cualquiera de las dos fuentes autentica.
  success: Una request con un token firmado con `SUPABASE_JWT_SECRET` autentica correctamente. Una request con un token firmado con `JWT_SECRET` (emitido por `signAccess`) sigue autenticando. `bun test` pasa con 0 fallas.

- id: CAP-2
  phase: 1
  intent: Si el `sub` del JWT no existe en la tabla `users`, el authPlugin crea automáticamente la fila con `id = sub`, `role = "driver"` y `password_hash = "supabase"` (placeholder, columna es notNull).
  success: Un usuario nuevo cuyo `sub` nunca pasó por el backend es auto-creado en `users` en su primera request autenticada, y la request resuelve `user` correctamente.

- id: CAP-3
  phase: 3
  intent: Se elimina todo el código de auth interno: registro, login, password hashing, OTP store, JWT signing, refresh token propio, change/reset/forgot password.
  success: `grep -r "signAccess\|signRefresh\|hashPassword\|registerPhone\|OtpStore\|generateOtp\|buildAuthResponse" src/` no encuentra resultados. `bun test` pasa con 0 fallas.

- id: CAP-4
  phase: 3
  intent: Los tests de integración usan tokens firmados con `SUPABASE_JWT_SECRET` en vez de tokens auto-firmados con `JWT_SECRET`.
  success: El helper compartido (`shared/testing/utils.ts`) expone `createTestToken(userId, role)` que firma con `SUPABASE_JWT_SECRET`. Ningún test importa `signAccess` o `signRefresh`.

- id: CAP-5
  phase: 2
  intent: El frontend usa Supabase Auth para registro, login y reset de password. `authStore` refleja la sesión de Supabase. El logout llama a `supabase.auth.signOut()` y a `POST /api/auth/logout`.
  success: El usuario se registra y loguea usando `supabase.auth.*`. El token que viaja al backend como Bearer es un JWT de Supabase. Al hacer logout, la sesión de Supabase se cierra y los refresh tokens del backend quedan revocados.

## Constraints

- **El secreto JWT de Supabase no se hardcodea.** Se lee de `SUPABASE_JWT_SECRET`.
- **Phase 1 no rompe nada.** Todos los endpoints actuales (`/auth/*`, `/api/onboarding/*`, `/api/kyc/*`, `/api/trips/*`, etc.) siguen funcionando exactamente igual.
- **`JWT_SECRET` se conserva** hasta completar Phase 3. Es el fallback y sigue firmando los tokens del auth interno mientras el frontend lo use.
- **El schema de DB no se modifica.** La tabla `users` se conserva. `users.id` puede almacenar el UUID de Supabase (`sub` del JWT), creado en la primera request autenticada.
- **La tabla `refresh_tokens` no se elimina** — se conserva para `/auth/logout` y para el auth interno mientras exista.

## Non-goals

- No se elimina el auth interno del backend en Phase 1 (eso es Phase 3).
- No se migra el frontend en Phase 1 (eso es Phase 2).
- No se toca el WebSocket (`/ws/location`) más allá de que `verifyAccess` ahora acepta ambas fuentes.
- No se modifica CI/CD.
- No se implementa sincronización bidireccional Supabase↔backend. Solo upsert en el backend cuando llega un `sub` nuevo.

## Success signal

**Phase 1 (este ciclo):** El backend levanta con `SUPABASE_JWT_SECRET` configurado. Un token de Supabase válido autentica y auto-crea el usuario. Un token del auth interno (`signAccess`) sigue autenticando. `bun test` corre con 0 fallas, typecheck y lint limpios. La app existente sigue funcionando sin cambios.

## Assumptions

- Supabase Auth está corriendo y accesible desde los entornos de desarrollo y producción.
- El `sub` del JWT de Supabase es un UUID. La tabla `users` usa UUIDs. Son compatibles.
- El rol por defecto para todo usuario nuevo es `"driver"`, que coincide con `users.role.default("driver")` en el schema.
- La columna `users.password_hash` es `notNull`; para usuarios creados vía Supabase se usa el placeholder `"supabase"` (el hash real no aplica).
- Ambos secretos usan HS256, el mismo algoritmo que ya usa el backend.
