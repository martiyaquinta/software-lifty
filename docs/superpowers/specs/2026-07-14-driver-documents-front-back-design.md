# Documentos del conductor: frente/dorso + antecedentes penales

**Fecha:** 2026-07-14
**Estado:** Aprobado

## Objetivo

El onboarding del conductor hoy pide 3 documentos (licencia, cédula del vehículo, seguro), cada uno con un solo archivo. Se necesita:

1. Cada documento pide **dos archivos: frente y dorso**, ambos obligatorios.
2. Agregar un cuarto documento: **certificado de antecedentes penales**, obligatorio como los demás.
3. Cada cara mantiene las 3 fuentes de subida actuales: cámara, galería y archivo (file picker).
4. La re-subida desde el perfil tiene el mismo comportamiento (frente/dorso, incluye antecedentes).

## Decisiones

- **Modelado (Opción A):** cada cara es un registro propio en `driver_documents`, distinguido por sufijo en `doc_type`. Sin migraciones de DB (`doc_type` es `varchar(50)` sin enum; la validación es solo de aplicación).
- **Ambas caras obligatorias** para habilitar el envío, incluso para PDFs.
- **Sin retrocompatibilidad** con los tipos viejos (`license`, `drivers_license`, etc.): no hay producción ni datos que preservar. Se eliminan de las listas válidas.

## Tipos de documento (backend)

8 valores válidos de `doc_type`:

| Documento | Frente | Dorso |
|---|---|---|
| Licencia de conducir | `license_front` | `license_back` |
| Cédula del vehículo | `registration_front` | `registration_back` |
| Seguro del vehículo | `insurance_front` | `insurance_back` |
| Antecedentes penales | `background_check_front` | `background_check_back` |

## Cambios backend (`apps/backend`)

- `src/features/onboarding/schema.ts`: `validDocTypes` pasa a los 8 tipos nuevos (se eliminan los 7 actuales).
- `src/features/drivers/service.ts`:
  - `VALID_DOC_TYPES`: los 8 tipos nuevos.
  - `SENSITIVE_DOC_TYPES`: los 8 tipos nuevos (hoy todos los tipos son sensibles; se mantiene el criterio).
  - `REQUIRED_DOCUMENT_COUNT` se reemplaza por una verificación de **8 tipos distintos**: el paso `documents` se completa cuando existen los 8 `doc_type` con registros no-`superseded` (evita que 8 subidas del mismo tipo aprueben el paso). Aplica a `getMyStatus()` y `addDocument()`.
- Sin cambios en storage: el path `${driver.id}/${docType}-${Date.now()}` ya distingue las caras vía `doc_type`.
- Sin migraciones.

## Cambios mobile (`apps/mobile`)

- `src/screens/OnboardingStep2Screen.tsx`:
  - Lista de 4 documentos; cada uno con 2 slots (Frente / Dorso).
  - Cada slot conserva las 3 fuentes: cámara, galería, archivo. Compresión de imagen y límite de 10 MB sin cambios.
  - Estado: `Record<DocType, Record<'front' | 'back', DocState>>` (o equivalente).
  - Botón "ENVIAR DOCUMENTOS" habilitado solo con los 8 slots en `uploaded`.
- `src/screens/UploadDocumentScreen.tsx` (re-subida): recibe el documento base y muestra 2 slots Frente/Dorso; re-sube ambos vía `POST /api/drivers/me/documents/reupload` (un request por cara).
- `src/screens/ProfileScreen.tsx`: `MANAGEABLE_DOCS` suma "Certificado de antecedentes penales".
- `src/utils/upload.ts`: `DOC_TYPE_MAP` mapea `(documento, cara)` → `doc_type` del backend.
- `src/api/types.ts`: el `z.enum` de `doc_type` pasa a los 8 valores.

## Labels (es)

- Licencia de conducir
- Cédula del vehículo
- Seguro del vehículo
- Certificado de antecedentes penales
- Caras: "Frente" / "Dorso"

## Manejo de errores

- Backend rechaza `doc_type` fuera de los 8 válidos (validación Elysia existente).
- Mobile: cada slot mantiene su propio estado de error/reintento, como hoy.

## Testing

- Backend (`bun test`): actualizar tests de onboarding y drivers — tipos nuevos aceptados, tipos viejos rechazados, paso `documents` → `review` recién con los 8 tipos distintos, reupload de caras sensibles fuerza offline.
- Mobile (`jest`): actualizar tests existentes que toquen estos screens/utils.

## Fuera de alcance

- Migración de datos existentes (no hay producción).
- Cambios en el panel/endpoints de admin más allá de que verá 8 documentos.
- Enum o constraint de DB para `doc_type`.
