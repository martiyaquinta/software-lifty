# Design: Aprobación de conductores vía email + push notification

**Fecha:** 2026-07-19

## Contexto

El flujo actual de onboarding fuerza al conductor a esperar en `UnderReview` con polling
cada 10s hasta que un webhook de DIDIT o un admin manual apruebe. En desarrollo esto no
funciona porque los webhooks no llegan a localhost. Además, no hay un dashboard de admin.

Se reemplaza el flujo automático (webhook + polling) por uno manual vía email al admin,
que decide si aprobar o no al conductor con un solo clic.

## Flujo nuevo

```
Perfil (1/3) → KYC (DIDIT) → Vehículo (2/3) → Documentos (3/3)
                                                    │
                                          ┌─────────┘
                                          ▼
                                 Backend envía email al admin
                                 con todos los datos del conductor
                                 + token de aprobación único
                                          │
                                 Conductor ve pantalla de espera
                                 "Tus datos fueron enviados"
                                          │
                                 Admin recibe email, revisa datos,
                                 hace clic en "Aceptar conductor"
                                          │
                                          ▼
                                 Backend valida token → aprueba driver
                                 Envía push notification al conductor
                                          │
                                 Conductor recibe push, abre la app
                                 Ya puede usar Lifty
```

## Decisiones

### 1. Mobile — Saltar UnderReview después de KYC

`KYCWebViewScreen` actualmente navega a `UnderReview` al terminar DIDIT. Ahora navega
directamente a `OnboardingVehicle` (paso 2/3). El backend ya debe tener el `kyc_status`
actualizado vía `refreshDecision` que corre en UnderReview — se moverá esa lógica al
momento de navegar desde KYCWebView.

**Cambios:**
- `KYCWebViewScreen.tsx`: `finish()` navega a `OnboardingVehicle` en vez de `UnderReview`
- Agregar llamada a `refreshDecision` antes de navegar (para actualizar el backend)

### 2. Mobile — Nueva pantalla de espera post-documentos

Al enviar documentos (paso 3/3), en vez de navegar a `UnderReview`, se navega a
`WaitingApprovalScreen`.

**Nueva pantalla: `WaitingApprovalScreen.tsx`**
- Muestra mensaje: "Tus datos fueron enviados. Un administrador los revisará y te
  notificaremos cuando tu cuenta esté aprobada."
- No hace polling — espera la push notification
- Botón "Salir" que cierra la app
- En DEV: botón "Saltar (DEV)" para simular aprobación instantánea

### 3. Mobile — Manejo de push notification de aprobación

Cuando el conductor recibe la push notification "Tu cuenta fue aprobada":
- Al abrirla, la app verifica `GET /drivers/me/status`
- Si `status === 'approved'`, navega a `Online`
- Si no, muestra la pantalla de espera actual

### 4. Backend — Email al admin al completar documentos

Al terminar de subir documentos (`OnboardingStep2Screen` → `POST /drivers/me/documents`
o equivalente), el backend:

1. Actualiza el estado del driver a `review`
2. Genera un `approval_token` (UUID v4), lo guarda en la tabla `drivers`
3. Envía email a `liftyviajes@gmail.com` (configurable vía `ADMIN_EMAIL`) con:
   - Nombre completo del conductor
   - Teléfono
   - Email
   - Estado KYC (aprobado/rechazado/pendiente)
   - Nombre verificado por DIDIT
   - Datos del vehículo: tipo, patente, marca, modelo, año, color
   - Links a los documentos subidos (front y back de cada tipo)
   - Botón "Aceptar conductor" → link a `GET /api/admin/approve?token=<uuid>`

**Configuración:**
- `ADMIN_EMAIL=liftyviajes@gmail.com` en `.env`
- Email via Resend (ya integrado)

### 5. Backend — Endpoint de aprobación

**`GET /api/admin/approve?token=<uuid>`** (público, sin auth)

1. Busca el token en `drivers.approval_token`
2. Si no existe o ya fue usado → error 404
3. Marca `drivers.status = 'approved'`, `drivers.approval_token = NULL`,
   `drivers.approved_at = NOW()`
4. Busca el device token del driver para push notification
5. Envía push notification: "Tu cuenta fue aprobada. Ya podes empezar a usar Lifty."
6. Responde con HTML simple: "Conductor aprobado correctamente" (para que el admin
   vea confirmación en el navegador)

### 6. Backend — Push notification via FCM

Al aprobar al driver, se envía una push notification usando Firebase Cloud Messaging
(ya configurado `FCM_SERVICE_ACCOUNT_JSON`).

**Archivo nuevo o reutilizar:** `src/shared/lib/notifications.ts`
- `sendPushNotification(userId: string, title: string, body: string): Promise<void>`
- Busca `device_token` en tabla `users` o tabla dedicada
- Envía via FCM HTTP v1 API

### 7. DB — Nuevos campos

**Tabla `drivers`:**
- `approval_token` — `text`, nullable, unique. Token único para aprobación vía email.
- `approved_at` — `timestamp`, nullable. Fecha de aprobación.

**Tabla `users` (o nueva tabla `device_tokens`):**
- `device_token` — `text`, nullable. Token FCM del dispositivo para push notifications.

## Archivos afectados

### Mobile
- `src/screens/KYCWebViewScreen.tsx` — navegar a `OnboardingVehicle` en vez de `UnderReview`
- `src/screens/OnboardingStep2Screen.tsx` — `handleVerify()` navega a `WaitingApprovalScreen`
- `src/screens/WaitingApprovalScreen.tsx` — **NUEVO**: pantalla de espera post-documentos
- `src/hooks/useAppNavigation.ts` — agregar ruta `WaitingApproval`
- `app/waiting-approval.tsx` — **NUEVO**: ruta expo-router
- `src/lib/postAuthRouting.ts` — opcional: agregar step `waiting` al routing
- `app.json` o config de notificaciones — asegurar manejo de push notifications

### Backend
- `src/features/drivers/service.ts` — `getMyStatus()` y endpoint de envío de documentos
- `src/features/onboarding/service.ts` — disparar email + token al completar documentos
- `src/features/admin/approve.ts` — **NUEVO**: endpoint `GET /api/admin/approve`
- `src/features/admin/notifications.ts` — **NUEVO** o extender: email al admin, push al driver
- `src/shared/lib/notifications.ts` — **NUEVO**: envío de push notifications via FCM
- `src/shared/db/schema/*.ts` — agregar columnas `approval_token`, `approved_at`, `device_token`
- `supabase/migrations/` — nueva migración para las columnas

### Configuración
- `.env` / `.env.example` — `ADMIN_EMAIL=liftyviajes@gmail.com`
- `FCM_SERVICE_ACCOUNT_JSON` — ya existe, verificar que funcione

## Fuera de alcance

- No se modifica el flujo de DIDIT (la integración KYC sigue igual).
- No se crea dashboard de admin web — el email es la interfaz de admin.
- No se implementa rechazo vía email (solo aprobación). Si el admin quiere rechazar,
  ignora el email y el conductor queda en espera.
- No se modifica `UnderReviewScreen` (queda en desuso para el flujo nuevo, pero se
  conserva por si otros flujos la usan).
