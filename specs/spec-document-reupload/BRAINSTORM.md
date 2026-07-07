# Brainstorm — Re-subida de documentos del conductor

**Fecha:** 2026-07-07
**Técnica:** AI-Recommended (Anti-Solution → Role Playing → First Principles)

## Problema

Hoy el conductor solo puede subir documentos durante el onboarding
(`OnboardingStep2Screen` → `POST /onboarding/step3/upload`). Desde el perfil
(`ProfileScreen`) la lista de documentos es **solo lectura**: no hay forma de
re-subir un doc vencido, rechazado o faltante. Existe una pantalla huérfana
(`UploadDocumentScreen`, ruta `/upload-document`) que nadie invoca.

## Decisiones de política (usuario)

1. **Todos** los documentos deben permitir re-subida.
2. Al re-subir un documento **sensible**, se **notifica al admin** y el
   conductor **no puede ponerse en línea** hasta que el admin apruebe el cambio.
   - Sensibles (pausan "en línea"): `license`, `insurance`, `registration`
     (titularidad del vehículo), `background_check`.
   - No sensibles (no pausan): email, teléfono, foto de perfil.
3. Mientras está pendiente de revisión, el conductor **sigue usando la app**
   normalmente; solo ve un cartel "Documentos pendientes de revisión — no podés
   conectarte hasta tener los papeles en regla" y el toggle de conectarse queda
   bloqueado.

## Agujeros de abuso detectados (Fase Anti-Solution) → tapón

| Abuso | Tapón |
| --- | --- |
| Bait & switch (cambia doc tras aprobación) | Re-subida de sensible vuelve a `review`; nunca se auto-aprueba |
| Metralleta (inunda la cola) | 1 sola review abierta por driver; re-subir reemplaza, no duplica |
| Auto-aprobado (sigue online) | `is_online=false` forzado + gating en backend, no solo UI |
| Colador de tipo (miente doc_type) | La sensibilidad la decide el **servidor** por enum |
| Ventana (viaje en curso) | Se bloquea aceptar nuevos; no puede volver a online |
| Historial borrado | Nunca se pisa la URL: fila nueva + doc viejo `superseded` |

## Descubrimiento clave

El backend de admin **ya existe** (`GET /admin/drivers/pending`,
`POST /admin/drivers/:id/review`) y `drivers` ya tiene columnas
`admin_review_status / admin_reviewed_by / at / notes`. "Notificar al admin" =
reinsertar al conductor en esa cola existente (`drivers.status='review'`,
`admin_review_status='pending'`). No se construye infra nueva de notificación;
email al admin queda como best-effort opcional.

## Diseño final

### Datos
- `driver_documents.status`: `pending_review | approved | rejected | superseded`
  (default `pending_review`).
- `driver_documents.superseded_at` timestamp nullable.
- `drivers.documents_pending_review` boolean (default false) — flag derivado para
  gating rápido y para el banner del cliente.

### Backend
- `driversService.reuploadDocument(user, file, docType)`:
  - Valida `docType`. Sube archivo (fila nueva). Marca docs previos del mismo
    `doc_type` como `superseded`.
  - Si el docType es **sensible**: `drivers.status='review'`,
    `admin_review_status='pending'`, `is_online=false`,
    `documents_pending_review=true`. (Notifica admin = queda en la cola).
- `driversService.toggleOnline`: rechaza `is_online=true` si
  `documents_pending_review` (error `DOCUMENTS_UNDER_REVIEW`).
- `getMyProfile` / `getMyStatus` / `listDocuments` exponen
  `documents_pending_review` y `status` por documento.
- `adminService.reviewDriver` (approve): baja `documents_pending_review=false` y
  marca docs `pending_review` → `approved`.

### Endpoint
- `POST /drivers/me/documents/reupload` (multipart: `file`, `doc_type`).

### Mobile
- `ProfileScreen`: cada doc con botón "Subir"/"Volver a subir" →
  `UploadDocument` con `docType`/`docLabel`. Refrescar al volver.
- `UploadDocumentScreen`: sube al endpoint de reupload.
- Banner + bloqueo del toggle "en línea" cuando `documents_pending_review`.
