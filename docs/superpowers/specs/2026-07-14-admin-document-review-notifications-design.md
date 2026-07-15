# Design: Notificaciones admin-driver para revisión de documentos

**Fecha:** 2026-07-14

## Contexto

Cuando un driver completa el paso 3 del onboarding (subida de documentos), el backend pone
al driver en estado `review` y existe el endpoint `POST /admin/drivers/:id/review` para que
un admin apruebe o rechace. Pero actualmente:

1. El admin no recibe ninguna notificación de que hay documentos nuevos para revisar.
2. El driver no recibe notificación cuando es aprobado o rechazado.
3. La pantalla `UnderReview` del mobile no muestra el motivo del rechazo ni permite
   re-subir documentos sin salir de la app.

## Objetivo

Cerrar el loop de comunicación admin ↔ driver durante la revisión de documentos.

## Decisiones

### 1. Backend — Notificación al admin por email (Resend)

Cuando un driver llega al estado `review` (tras completar step3 o addDocument), se envía
un email a todos los usuarios con `role = 'admin'` más un email de respaldo configurable
vía `ADMIN_EMAIL`.

**Archivo nuevo:** `src/features/admin/notifications.ts`
- `notifyAdminsNewDocuments(driverName: string, driverId: string): Promise<void>`
  - Busca `SELECT email FROM users WHERE role = 'admin'`
  - Si `ADMIN_EMAIL` está seteado, lo agrega (evitando duplicados)
  - Envía email con asunto "Nuevo conductor para revisar" y body con nombre + ID del driver
  - Loggea en vez de enviar si `NODE_ENV !== 'production'` (usa `sendEmail` existente)

**Puntos de disparo:**
- `onboarding/service.ts` → `step3()` y `uploadDocument()`: después del `UPDATE drivers SET status = 'review'`
- `drivers/service.ts` → `addDocument()`: cuando `docsList.length >= REQUIRED_DOCUMENT_COUNT` y se pone en `review`
- `drivers/service.ts` → `reuploadDocument()`: cuando `isSensitive` es true y se pone en `review`

En todos los casos: disparo fire-and-forget (no bloquea la respuesta al driver).

### 2. Backend — Notificación al driver por email (Resend)

Cuando el admin aprueba o rechaza, se envía un email al driver.

**Archivo:** `src/features/admin/notifications.ts`
- `notifyDriverApproved(driverEmail: string, driverName: string): Promise<void>`
  - Asunto: "Tus documentos fueron aprobados"
  - Body: mensaje de bienvenida, ya puede empezar a conducir
- `notifyDriverRejected(driverEmail: string, driverName: string, reason?: string): Promise<void>`
  - Asunto: "Tus documentos fueron rechazados"
  - Body: motivo del rechazo (si hay) + instrucciones para volver a subir

**Punto de disparo:**
- `admin/service.ts` → `reviewDriver()`: después del update, buscar email del driver vía
  join con `users`, enviar notificación correspondiente. Fire-and-forget.

### 3. Backend — Exponer admin_review_notes en el status

El endpoint `GET /drivers/me/status` (`driversService.getMyStatus`) debe incluir
`admin_review_notes` en la respuesta cuando el status es `rejected`. Esto permite que
la pantalla `UnderReview` muestre el motivo del rechazo.

**Cambio en `drivers/service.ts` → `getMyStatus()`:**
- Agregar `admin_review_notes` al SELECT
- Incluirlo en el return cuando status es `rejected`

**Cambio en tipo de respuesta** (`api/types.ts` en mobile y schema en backend):
- Agregar campo opcional `admin_review_notes?: string | null`

### 4. Mobile — Mejoras en UnderReviewScreen

**Estado "No pudimos verificar tu estado":**
- Ya existe (`failureCount >= 3`). El botón "Reintentar" hace `refetch()`.
- Mejora: si después de reintentar sigue fallando y el step es `documents` o `review`,
  agregar un botón "Volver a subir documentos" que navega a `OnboardingStep2`.

**Estado "Rechazado":**
- Actualmente redirige a `KYCVerify` después de 2.5s. Esto es incorrecto para
  rechazo de documentos (debería volver a la pantalla de documentos, no a KYC).
- Cambio: si `admin_review_notes` tiene contenido, mostrar el motivo.
- Botón "Volver a subir documentos" → navega a `OnboardingStep2`.
- Botón "Reintentar verificación" si es rechazo de KYC → navega a `KYCVerify`.

**Estado "Aprobado":**
- Actualmente navega instantáneamente a `Online`.
- Mejora: mostrar una animación/confirmación visual breve (1.5s) antes de navegar.
  Icono de check verde + texto "Verificado" con fade-in.

**Diferenciar rechazo de KYC vs documentos:**
- Si `data.step === 'kyc'` → rechazo de identidad → botón vuelve a `KYCVerify`
- Si `data.step === 'review'` o `data.step === 'documents'` → rechazo de docs →
  botón vuelve a `OnboardingStep2`

### 5. Admin email de respaldo

Nueva variable de entorno `ADMIN_EMAIL` (opcional). Si está seteada, se incluye en la
lista de destinatarios de notificaciones de admin, además de los usuarios con `role='admin'`.

## Archivos afectados

### Backend
- `src/features/admin/notifications.ts` — **NUEVO**: funciones de envío de emails
- `src/features/onboarding/service.ts` — disparar `notifyAdminsNewDocuments` en step3/uploadDocument
- `src/features/drivers/service.ts` — disparar `notifyAdminsNewDocuments` en addDocument/reuploadDocument
- `src/features/admin/service.ts` — disparar emails al driver en reviewDriver + obtener email del driver
- `src/features/drivers/schema.ts` — agregar `admin_review_notes` al schema de status response
- `src/features/drivers/routes.ts` — (si es necesario) actualizar respuesta tipada

### Mobile
- `src/screens/UnderReviewScreen.tsx` — lógica de rechazo KYC vs docs, motivo de rechazo, botón volver a subir, animación de aprobado
- `src/api/types.ts` — agregar `admin_review_notes` opcional al `driverStatusSchema`

### Otros
- `.env.example` (si existe) — documentar `ADMIN_EMAIL`

## Fuera de alcance

- No se crean pantallas de admin en mobile (será una web aparte).
- No se implementa push notifications (solo email por ahora).
- No se modifica el flujo de KYC (DIDIT).
- No se modifica la estructura de la DB (las columnas `admin_review_notes`,
  `admin_review_status`, etc. ya existen).
