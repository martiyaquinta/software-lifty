# Documentos frente/dorso + antecedentes penales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada documento del conductor (licencia, cédula, seguro, antecedentes penales) exige dos archivos (frente y dorso); se agrega antecedentes penales como cuarto documento obligatorio.

**Architecture:** Cada cara es un registro propio en `driver_documents`, distinguido por sufijo en `doc_type` (ej. `license_front`). Sin migraciones de DB (`doc_type` es `varchar(50)` validado solo en aplicación). El paso `documents` se completa cuando existen los 8 `doc_type` distintos no-superseded.

**Tech Stack:** Backend: Bun + Elysia + Drizzle. Mobile: Expo SDK 56 + expo-router + jest.

**Spec:** `docs/superpowers/specs/2026-07-14-driver-documents-front-back-design.md`

## Global Constraints

- Rama de trabajo: `feat/driver-docs-front-back` (ya creada, baseline verde: 228 tests backend, 10 tests mobile).
- Commits: Conventional Commits (enforced por commitlint). Lefthook corre biome en staged files.
- Backend tests: `bun test` desde `apps/backend` (requiere docker compose dev levantado: postgres 5433, redis 6380).
- Mobile: `bun run test` (jest) y `bunx tsc --noEmit` desde `apps/mobile`.
- Mobile: named exports only, estilos con `theme.colors.*`/`theme.spacing.*` etc., nunca hardcodear colores.
- Los 8 `doc_type` válidos de backend: `license_front`, `license_back`, `registration_front`, `registration_back`, `insurance_front`, `insurance_back`, `background_check_front`, `background_check_back`. Los tipos viejos (`license`, `registration`, `insurance`, `background_check`, `drivers_license`, `vehicle_registration`, `vehicle_insurance`) dejan de ser válidos.
- Labels (es): "Licencia de conducir", "Cedula del vehiculo", "Seguro del vehiculo", "Certificado de antecedentes penales"; caras: "Frente" / "Dorso". (El codebase no usa tildes en strings de UI existentes de estas pantallas — mantener ese estilo.)
- NO agregar comentarios salvo los indicados en los snippets.

---

### Task 1: Backend — módulo compartido de doc types + listas de validación

**Files:**
- Create: `apps/backend/src/shared/lib/documents.ts`
- Modify: `apps/backend/src/features/onboarding/schema.ts:3-11`
- Modify: `apps/backend/src/features/onboarding/service.ts:11-19`
- Modify: `apps/backend/src/features/drivers/service.ts:9-31`
- Modify (tests existentes): `apps/backend/src/features/onboarding/onboarding.test.ts`, `apps/backend/src/features/drivers/drivers.test.ts`, `apps/backend/src/features/admin/admin.test.ts`, `apps/backend/src/all-endpoints.test.ts`

**Interfaces:**
- Produces: `DOC_TYPES: readonly string[]` (los 8 tipos), `type DocType`, exportados desde `apps/backend/src/shared/lib/documents.ts`. Task 2 los consume como `REQUIRED` set.

- [ ] **Step 1: Escribir tests que fallan (tipos nuevos aceptados, viejos rechazados)**

En `apps/backend/src/features/onboarding/onboarding.test.ts`, agregar dentro del `describe` principal (después del test `'step3 with invalid doc_type returns error'`, ~línea 240):

```typescript
test('upload accepts new front/back doc types', async () => {
  const token = await setupKycApprovedDriver(); // usar el helper que ya usan los tests de upload de este archivo (replicar el setup del test 'step3/upload uploads a file')
  const fileContent = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
  const formData = new FormData();
  formData.append('file', fileContent, 'license-front.png');
  formData.append('doc_type', 'license_front');

  const res = await app.handle(
    new Request('http://localhost/api/onboarding/step3/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }),
  );
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.doc_type).toBe('license_front');
});

test('upload rejects legacy doc types', async () => {
  const token = await setupKycApprovedDriver();
  const fileContent = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
  const formData = new FormData();
  formData.append('file', fileContent, 'license.png');
  formData.append('doc_type', 'license');

  const res = await app.handle(
    new Request('http://localhost/api/onboarding/step3/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }),
  );
  expect(res.status).toBe(422);
});
```

Nota: los tests existentes del archivo no usan un helper literal `setupKycApprovedDriver` — replicar el patrón de setup del test existente `'step3/upload uploads a file'` (~línea 270): registrar usuario, aprobar KYC en DB, crear driver. Ajustar el nombre/forma al patrón real del archivo. El status esperado para doc_type inválido: verificar cómo asserta el test existente `'step3 with invalid doc_type returns error'` (~línea 218) y usar el mismo código de status.

- [ ] **Step 2: Correr los tests nuevos y verificar que fallan**

Run: `bun test src/features/onboarding/onboarding.test.ts` (desde `apps/backend`)
Expected: FAIL — `'upload accepts new front/back doc types'` falla con 422 (el tipo `license_front` no es válido todavía).

- [ ] **Step 3: Crear el módulo compartido**

Crear `apps/backend/src/shared/lib/documents.ts`:

```typescript
export const DOC_TYPES = [
  'license_front',
  'license_back',
  'registration_front',
  'registration_back',
  'insurance_front',
  'insurance_back',
  'background_check_front',
  'background_check_back',
] as const;

export type DocType = (typeof DOC_TYPES)[number];
```

- [ ] **Step 4: Usar el módulo en las 3 listas de validación**

En `apps/backend/src/features/onboarding/schema.ts`, reemplazar líneas 1-11:

```typescript
import { t } from 'elysia';
import { DOC_TYPES } from '../../shared/lib/documents';
```

y donde se usaba `validDocTypes` (líneas 29 y 38) usar `DOC_TYPES`:

```typescript
      doc_type: t.String({ enum: DOC_TYPES }),
```
```typescript
  doc_type: t.String({ enum: DOC_TYPES }),
```

En `apps/backend/src/features/onboarding/service.ts`, borrar el array local `VALID_DOC_TYPES` (líneas 11-19) e importar:

```typescript
import { DOC_TYPES } from '../../shared/lib/documents';
```

Reemplazar los dos usos `VALID_DOC_TYPES.includes(...)` por `(DOC_TYPES as readonly string[]).includes(...)`.

En `apps/backend/src/features/drivers/service.ts`, reemplazar líneas 9-31 por:

```typescript
import { DOC_TYPES } from '../../shared/lib/documents';

const VALID_DOC_TYPES: readonly string[] = DOC_TYPES;

// Sensitive documents gate the driver's ability to go online: re-uploading one
// forces a fresh admin review and pauses "online" until approved. The server —
// never the client — decides sensitivity, so a driver can't dodge review by
// mislabelling a doc_type.
const SENSITIVE_DOC_TYPES = new Set<string>(DOC_TYPES);
```

(EL import va junto a los demás imports del archivo, arriba. `REQUIRED_DOCUMENT_COUNT` queda como está — se elimina en Task 2.)

- [ ] **Step 5: Actualizar los tests existentes que usan tipos viejos**

Mapping de reemplazo (aplicar en los 4 archivos de test):

| Viejo | Nuevo |
|---|---|
| `'license'` | `'license_front'` |
| `'insurance'` | `'insurance_front'` |
| `'background_check'` | `'background_check_front'` |

Ubicaciones conocidas (verificar con grep `doc_type` en cada archivo):
- `onboarding.test.ts`: líneas ~180-181, ~209, ~276-277, ~288, ~295 (`'license'`, `'insurance'`). El test `'step3 with invalid doc_type returns error'` (~218) queda igual (usa `'invalid_type'`).
- `drivers.test.ts`: líneas ~334, ~348, ~364-367, ~381 (`'license'`), ~407 (`'background_check'`).
- `admin.test.ts`: líneas ~67-68 (`'license'`, `'insurance'`).
- `all-endpoints.test.ts`: líneas ~377, ~454, ~465 (`'license'`); ~404 (`'bad'`, queda igual).

- [ ] **Step 6: Correr toda la suite backend**

Run: `bun test` (desde `apps/backend`)
Expected: PASS (230 tests: los 228 previos + 2 nuevos). Si algún test asserta el string viejo en respuestas (ej. `expect(data.doc_type).toBe('license')` → `'license_front'`), actualizarlo.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/shared/lib/documents.ts apps/backend/src/features/onboarding apps/backend/src/features/drivers apps/backend/src/features/admin apps/backend/src/all-endpoints.test.ts
git commit -m "feat(backend): doc types frente/dorso + antecedentes penales"
```

---

### Task 2: Backend — completitud por 8 tipos distintos

**Files:**
- Modify: `apps/backend/src/features/drivers/service.ts:33-34,140-158,334-348`
- Modify: `apps/backend/src/features/onboarding/service.ts:229-232`
- Test: `apps/backend/src/features/drivers/drivers.test.ts`

**Interfaces:**
- Consumes: `DOC_TYPES` de `apps/backend/src/shared/lib/documents.ts` (Task 1).
- Produces: `getMyStatus()` devuelve `step: 'documents'` hasta que existan los 8 `doc_type` distintos no-superseded; luego `step: 'review'`.

- [ ] **Step 1: Escribir tests que fallan**

En `apps/backend/src/features/drivers/drivers.test.ts`, agregar (usando los helpers de setup existentes del archivo para crear driver con KYC aprobado y vehículo):

```typescript
test('status stays in documents step until all 8 doc types uploaded', async () => {
  // setup: driver con KYC aprobado + vehiculo (replicar helper existente del archivo)
  // insertar 7 de los 8 tipos:
  const seven = [
    'license_front',
    'license_back',
    'registration_front',
    'registration_back',
    'insurance_front',
    'insurance_back',
    'background_check_front',
  ];
  await db.insert(driverDocuments).values(
    seven.map((doc_type) => ({
      driver_id: driverId,
      doc_type,
      file_url: 'https://x.com/f.png',
    })),
  );

  const res = await app.handle(
    new Request('http://localhost/api/drivers/me/status', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  const data = await res.json();
  expect(data.step).toBe('documents');
});

test('duplicate doc types do not complete the documents step', async () => {
  // setup igual; insertar 8 filas del MISMO tipo:
  await db.insert(driverDocuments).values(
    Array.from({ length: 8 }, () => ({
      driver_id: driverId,
      doc_type: 'license_front',
      file_url: 'https://x.com/f.png',
    })),
  );

  const res = await app.handle(
    new Request('http://localhost/api/drivers/me/status', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  const data = await res.json();
  expect(data.step).toBe('documents');
});

test('all 8 distinct doc types move driver to review', async () => {
  // setup igual; insertar los 8 tipos:
  await db.insert(driverDocuments).values(
    DOC_TYPES.map((doc_type) => ({
      driver_id: driverId,
      doc_type,
      file_url: 'https://x.com/f.png',
    })),
  );

  const res = await app.handle(
    new Request('http://localhost/api/drivers/me/status', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  const data = await res.json();
  expect(data.step).toBe('review');
});
```

Importar `DOC_TYPES` desde `../../shared/lib/documents` en el test. Ajustar la URL del endpoint de status al que usen los tests existentes del archivo (grep `me/status` o `getMyStatus`).

- [ ] **Step 2: Correr y verificar que fallan**

Run: `bun test src/features/drivers/drivers.test.ts` (desde `apps/backend`)
Expected: FAIL — `'status stays in documents step until all 8'` falla porque con 7 docs (≥3) el step ya es `'review'`.

- [ ] **Step 3: Implementar completitud por tipos distintos**

En `apps/backend/src/features/drivers/service.ts`:

Reemplazar líneas 33-34 (`REQUIRED_DOCUMENT_COUNT`) por:

```typescript
// Onboarding requires every doc type (front and back of each document).
function hasAllRequiredDocs(uploaded: { doc_type: string }[]): boolean {
  const types = new Set(uploaded.map((d) => d.doc_type));
  return DOC_TYPES.every((t) => types.has(t));
}
```

En `getMyStatus` (líneas 141-150), reemplazar:

```typescript
    const docsList = await db
      .select({ doc_type: driverDocuments.doc_type })
      .from(driverDocuments)
      .where(
        and(eq(driverDocuments.driver_id, driver.id), ne(driverDocuments.status, 'superseded')),
      );

    if (!hasAllRequiredDocs(docsList)) {
      return { status: 'pending', step: 'documents', kyc_status: 'approved' };
    }
```

En `addDocument` (líneas 334-348), reemplazar:

```typescript
    const docsList = await db
      .select({ doc_type: driverDocuments.doc_type })
      .from(driverDocuments)
      .where(
        and(eq(driverDocuments.driver_id, driver.id), ne(driverDocuments.status, 'superseded')),
      );

    // All required docs submitted → hand the driver to the admin review queue
    // (adminService.listPending filters by status = 'review').
    if (hasAllRequiredDocs(docsList) && driver.status !== 'approved') {
      await db
        .update(drivers)
        .set({ status: 'review', admin_review_status: 'pending', updated_at: new Date() })
        .where(eq(drivers.id, driver.id));
    }
```

En `apps/backend/src/features/onboarding/service.ts`, `uploadDocument` (líneas 229-232) hoy setea `status: 'review'` incondicionalmente tras cada upload. Reemplazar por la misma condición:

```typescript
    const uploaded = await db
      .select({ doc_type: driverDocuments.doc_type })
      .from(driverDocuments)
      .where(
        and(eq(driverDocuments.driver_id, driver.id), ne(driverDocuments.status, 'superseded')),
      );

    const uploadedTypes = new Set(uploaded.map((d) => d.doc_type));
    if (DOC_TYPES.every((t) => uploadedTypes.has(t))) {
      await db
        .update(drivers)
        .set({ status: 'review', updated_at: new Date() })
        .where(eq(drivers.id, driver.id));
    }
```

(Agregar `and`, `ne` a los imports de drizzle del archivo si faltan.)

- [ ] **Step 4: Correr toda la suite backend y arreglar tests desactualizados**

Run: `bun test` (desde `apps/backend`)
Expected: los 3 tests nuevos PASS. Tests existentes que asuman "3 documentos completan el paso" o que esperen `status: 'review'` tras un solo upload van a fallar — actualizarlos para insertar los 8 tipos (usar `DOC_TYPES.map(...)` como arriba) o ajustar el step esperado a `'documents'`. Candidatos: `onboarding.test.ts` (~188, ~198, ~256), `all-endpoints.test.ts` (~377), `admin.test.ts` (~67-68: si el flujo admin requiere driver en `review`, setear `status: 'review'` directo en DB como probablemente ya hace, o insertar los 8 docs).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src
git commit -m "feat(backend): completar paso documentos con 8 tipos distintos"
```

---

### Task 3: Mobile — mapping de doc types y schema zod

**Files:**
- Modify: `apps/mobile/src/utils/upload.ts:3-49`
- Modify: `apps/mobile/src/api/types.ts:132-139`
- Test: `apps/mobile/src/__tests__/onboarding/doc-types.test.ts` (nuevo)

**Interfaces:**
- Produces (consumido por Tasks 4-6):
  - `type DocBase = 'drivers_license' | 'vehicle_registration' | 'vehicle_insurance' | 'background_check'`
  - `type DocSide = 'front' | 'back'`
  - `toBackendDocType(base: DocBase, side: DocSide): string` (ej. `('drivers_license','front') → 'license_front'`)
  - `uploadDocumentToBackend(uri, fileName, mimeType, docBase: DocBase, side: DocSide)`
  - `reuploadDocumentToBackend(uri, fileName, mimeType, docBase: DocBase, side: DocSide)`

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/mobile/src/__tests__/onboarding/doc-types.test.ts`:

```typescript
import { toBackendDocType } from '../../utils/upload';

describe('toBackendDocType', () => {
  it('maps every base doc and side to the backend doc_type', () => {
    expect(toBackendDocType('drivers_license', 'front')).toBe('license_front');
    expect(toBackendDocType('drivers_license', 'back')).toBe('license_back');
    expect(toBackendDocType('vehicle_registration', 'front')).toBe('registration_front');
    expect(toBackendDocType('vehicle_registration', 'back')).toBe('registration_back');
    expect(toBackendDocType('vehicle_insurance', 'front')).toBe('insurance_front');
    expect(toBackendDocType('vehicle_insurance', 'back')).toBe('insurance_back');
    expect(toBackendDocType('background_check', 'front')).toBe('background_check_front');
    expect(toBackendDocType('background_check', 'back')).toBe('background_check_back');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `bun run test -- doc-types` (desde `apps/mobile`)
Expected: FAIL — `toBackendDocType` no existe.

- [ ] **Step 3: Implementar**

En `apps/mobile/src/utils/upload.ts`, reemplazar líneas 3-7 por:

```typescript
export type DocBase =
  | 'drivers_license'
  | 'vehicle_registration'
  | 'vehicle_insurance'
  | 'background_check';
export type DocSide = 'front' | 'back';

const DOC_BASE_MAP: Record<DocBase, string> = {
  drivers_license: 'license',
  vehicle_registration: 'registration',
  vehicle_insurance: 'insurance',
  background_check: 'background_check',
};

export function toBackendDocType(base: DocBase, side: DocSide): string {
  return `${DOC_BASE_MAP[base]}_${side}`;
}
```

Cambiar las firmas de `uploadDocumentToBackend` y `reuploadDocumentToBackend`: el parámetro `docType: string` pasa a `docBase: DocBase, side: DocSide`, y el append pasa a:

```typescript
  formData.append('doc_type', toBackendDocType(docBase, side));
```

(en ambas funciones; `uploadPhotoToBackend` queda igual).

En `apps/mobile/src/api/types.ts`, reemplazar línea 135:

```typescript
  doc_type: z.enum([
    'license_front',
    'license_back',
    'registration_front',
    'registration_back',
    'insurance_front',
    'insurance_back',
    'background_check_front',
    'background_check_back',
  ]),
```

- [ ] **Step 4: Correr tests y typecheck**

Run: `bun run test` y `bunx tsc --noEmit` (desde `apps/mobile`)
Expected: test nuevo PASS. `tsc` va a fallar en `OnboardingStep2Screen.tsx` y `UploadDocumentScreen.tsx` (firmas cambiadas) — eso se arregla en Tasks 4-5; si el executor necesita commit verde de typecheck, puede dejar este commit para después de Task 5, pero preferimos commitear ya (CI corre en PR, no por commit).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/utils/upload.ts apps/mobile/src/api/types.ts apps/mobile/src/__tests__/onboarding/doc-types.test.ts
git commit -m "feat(mobile): mapping de doc types frente/dorso"
```

---

### Task 4: Mobile — OnboardingStep2Screen con 4 documentos × frente/dorso

**Files:**
- Modify: `apps/mobile/src/screens/OnboardingStep2Screen.tsx`

**Interfaces:**
- Consumes: `uploadDocumentToBackend(uri, name, mime, docBase, side)`, `DocBase`, `DocSide` (Task 3).

- [ ] **Step 1: Reescribir tipos, constantes y estado (líneas 25-61)**

```typescript
type DocType = DocBase;
type PickMethod = 'camera' | 'gallery' | 'file';

const DOCS: { type: DocType; label: string }[] = [
  { type: 'drivers_license', label: 'Licencia de conducir' },
  { type: 'vehicle_registration', label: 'Cedula del vehiculo' },
  { type: 'vehicle_insurance', label: 'Seguro del vehiculo' },
  { type: 'background_check', label: 'Certificado de antecedentes penales' },
];

const SIDES: { side: DocSide; label: string }[] = [
  { side: 'front', label: 'Frente' },
  { side: 'back', label: 'Dorso' },
];
```

`DocState` e `initialDocState` quedan igual. El estado pasa a doble nivel:

```typescript
type SideState = Record<DocSide, DocState>;

const initialSideState = (): SideState => ({
  front: { ...initialDocState },
  back: { ...initialDocState },
});

const [docs, setDocs] = useState<Record<DocType, SideState>>({
  drivers_license: initialSideState(),
  vehicle_registration: initialSideState(),
  vehicle_insurance: initialSideState(),
  background_check: initialSideState(),
});

const allUploaded = Object.values(docs).every((d) => d.front.uploaded && d.back.uploaded);
```

Importar `DocBase`, `DocSide` desde `../utils/upload` (junto al import existente de `uploadDocumentToBackend`).

- [ ] **Step 2: Actualizar `handlePick` y `handleRetry`**

`handlePick` pasa a `(docType: DocType, side: DocSide, method: PickMethod)`. Todos los `setDocs` internos cambian de la forma vieja:

```typescript
setDocs((prev) => ({ ...prev, [docType]: { ...prev[docType], error: '...' } }));
```

a actualizar solo la cara:

```typescript
setDocs((prev) => ({
  ...prev,
  [docType]: {
    ...prev[docType],
    [side]: { ...prev[docType][side], error: 'Sesion no valida. Reincia la app.' },
  },
}));
```

Aplicar el mismo patrón en los 5 `setDocs` de la función (error de sesión, error de permiso, error de tamaño, inicio de upload, éxito, y el catch). La llamada de upload pasa a:

```typescript
const result = await uploadDocumentToBackend(uri!, name!, mimeType!, docType, side);
```

`handleRetry` pasa a:

```typescript
const handleRetry = useCallback((docType: DocType, side: DocSide) => {
  setDocs((prev) => ({
    ...prev,
    [docType]: { ...prev[docType], [side]: { ...initialDocState } },
  }));
}, []);
```

- [ ] **Step 3: Actualizar el render**

Reemplazar el bloque `{DOCS.map(...)}` (líneas 220-284) por: mismo card exterior por documento, y adentro un sub-bloque por cara:

```tsx
{DOCS.map((doc) => (
  <View key={doc.type} style={styles.uploadBlock}>
    <View style={styles.uploadIcon}>
      <Ionicons
        name="document-text-outline"
        size={24}
        color={theme.colors.mediumGray}
        accessibilityLabel="Subir documento"
      />
    </View>
    <Text style={styles.uploadTitle}>{doc.label}</Text>

    {SIDES.map(({ side, label }) => {
      const state = docs[doc.type][side];
      return (
        <View key={side} style={styles.sideBlock}>
          <Text style={styles.sideLabel}>{label}</Text>

          {state.uploaded ? (
            <View style={styles.uploadedRow}>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={theme.colors.turquoise}
                accessibilityLabel="Documento subido"
              />
              <Text style={styles.fileName} numberOfLines={1}>
                {state.fileName}
              </Text>
            </View>
          ) : state.uploading ? (
            <ActivityIndicator size="small" color={theme.colors.turquoise} />
          ) : (
            <View style={styles.uploadOptions}>
              <TouchableOpacity
                style={styles.uploadOption}
                onPress={() => handlePick(doc.type, side, 'camera')}
                activeOpacity={0.7}
              >
                <Text style={styles.optionText}>Sacar foto</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.uploadOption}
                onPress={() => handlePick(doc.type, side, 'gallery')}
                activeOpacity={0.7}
              >
                <Text style={styles.optionText}>Subir de galeria</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.uploadOption}
                onPress={() => handlePick(doc.type, side, 'file')}
                activeOpacity={0.7}
              >
                <Text style={styles.optionText}>Subir archivo</Text>
              </TouchableOpacity>
            </View>
          )}

          {state.error && (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>{state.error}</Text>
              <TouchableOpacity onPress={() => handleRetry(doc.type, side)}>
                <Text style={styles.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    })}
  </View>
))}
```

Agregar al `StyleSheet.create` (después de `uploadTitle`):

```typescript
  sideBlock: {
    width: '100%',
    gap: theme.spacing.sm,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
    paddingTop: theme.spacing.sm,
  },
  sideLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
    alignSelf: 'flex-start',
  },
```

- [ ] **Step 4: Verificar**

Run: `bunx tsc --noEmit` (desde `apps/mobile`) → sin errores en este archivo (UploadDocumentScreen puede seguir fallando hasta Task 5).
Run: `bun run test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/OnboardingStep2Screen.tsx
git commit -m "feat(mobile): frente/dorso y antecedentes penales en onboarding"
```

---

### Task 5: Mobile — UploadDocumentScreen con dos caras

**Files:**
- Modify: `apps/mobile/src/screens/UploadDocumentScreen.tsx`

**Interfaces:**
- Consumes: `uploadDocumentToBackend` / `reuploadDocumentToBackend` `(uri, name, mime, docBase, side)`, `DocBase`, `DocSide`, `toBackendDocType` (Task 3).
- Route params (sin cambios de forma): `docType: DocBase`, `docLabel: string`, `mode?: 'reupload'`.

- [ ] **Step 1: Reescribir la pantalla para dos slots**

Cambios sobre `apps/mobile/src/screens/UploadDocumentScreen.tsx`:

```typescript
import type { DocBase, DocSide } from '../utils/upload';

type DocType = DocBase;

const SIDES: { side: DocSide; label: string }[] = [
  { side: 'front', label: 'Frente' },
  { side: 'back', label: 'Dorso' },
];
```

Estado:

```typescript
const [selectedFiles, setSelectedFiles] = useState<Record<DocSide, SelectedFile | null>>({
  front: null,
  back: null,
});
const [uploading, setUploading] = useState(false);
const bothSelected = selectedFiles.front !== null && selectedFiles.back !== null;
```

Los handlers `handleCamera`, `handleGallery`, `handleDocument` reciben `side: DocSide` y setean `setSelectedFiles((prev) => ({ ...prev, [side]: { ... } }))` (el contenido del asset queda igual que hoy).

`handleUpload` sube ambas caras en secuencia:

```typescript
const handleUpload = async () => {
  if (!bothSelected || !docType) return;

  setUploading(true);
  try {
    let requiresReview = false;
    for (const { side } of SIDES) {
      const file = selectedFiles[side];
      if (!file) continue;

      let uploadUri = file.uri;
      let uploadName = file.name;
      let uploadMimeType = file.mimeType || 'application/octet-stream';

      if (uploadMimeType.startsWith('image/')) {
        try {
          const compressed = await compressImage(uploadUri);
          uploadUri = compressed.uri;
          uploadName = uploadName.replace(/\.[^.]+$/, '.jpg');
          uploadMimeType = 'image/jpeg';
        } catch {}
      }

      if (isReupload) {
        const result = await reuploadDocumentToBackend(
          uploadUri,
          uploadName,
          uploadMimeType,
          docType,
          side,
        );
        requiresReview = requiresReview || result.requires_review;
      } else {
        await uploadDocumentToBackend(uploadUri, uploadName, uploadMimeType, docType, side);
      }
    }

    if (isReupload && requiresReview) {
      Alert.alert(
        'Documento enviado',
        'Tu documento quedo pendiente de revision. No vas a poder conectarte hasta que un administrador lo apruebe.',
      );
    }
    router.back();
  } catch (err) {
    console.error('Upload error:', err);
    Alert.alert('Error', 'Ocurrio un error al subir el documento.');
  } finally {
    setUploading(false);
  }
};
```

Render: reemplazar el bloque preview+options único por un map de `SIDES`, cada uno con su preview y sus opciones (misma estructura visual actual, con un título de cara). Por cada `{ side, label }`:

```tsx
{SIDES.map(({ side, label }) => {
  const file = selectedFiles[side];
  const isImage = file?.mimeType?.startsWith('image/');
  return (
    <View key={side} style={styles.sideSection}>
      <Text style={styles.sideTitle}>{label}</Text>
      <View style={styles.preview}>
        {file ? (
          isImage ? (
            <Image source={{ uri: file.uri }} style={styles.previewImage} />
          ) : (
            <View style={styles.previewFile}>
              <Text style={styles.previewIcon}>📄</Text>
              <Text style={styles.previewFileName} numberOfLines={2}>
                {file.name}
              </Text>
            </View>
          )
        ) : (
          <>
            <Text style={styles.previewIcon}>📄</Text>
            <Text style={styles.previewText}>Todavia no subiste nada</Text>
          </>
        )}
      </View>

      {file ? (
        <Button
          title="CAMBIAR ARCHIVO"
          variant="secondary"
          onPress={() => setSelectedFiles((prev) => ({ ...prev, [side]: null }))}
          style={styles.button}
        />
      ) : (
        <View style={styles.options}>
          <TouchableOpacity style={styles.option} onPress={() => handleCamera(side)} activeOpacity={0.7}>
            <Text style={styles.optionText}>📷 Sacar foto</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.option} onPress={() => handleGallery(side)} activeOpacity={0.7}>
            <Text style={styles.optionText}>🖼 Subir de galeria</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.option} onPress={() => handleDocument(side)} activeOpacity={0.7}>
            <Text style={styles.optionText}>📁 Subir archivo</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
})}

<Button
  title="SUBIR"
  variant="primary"
  onPress={handleUpload}
  loading={uploading}
  disabled={uploading || !bothSelected}
  style={styles.button}
/>
```

Estilos nuevos (agregar al StyleSheet; el resto queda igual; la altura de `preview` puede bajar de 200 a 140 para que entren ambas caras):

```typescript
  sideSection: {
    width: 343,
    gap: theme.spacing.sm,
  },
  sideTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.deepBlue,
  },
```

- [ ] **Step 2: Verificar**

Run: `bunx tsc --noEmit` (desde `apps/mobile`)
Expected: sin errores.
Run: `bun run test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/UploadDocumentScreen.tsx
git commit -m "feat(mobile): re-subida de documentos con frente y dorso"
```

---

### Task 6: Mobile — ProfileScreen: antecedentes + estado agregado por caras

**Files:**
- Modify: `apps/mobile/src/screens/ProfileScreen.tsx:63-96,286-308`

**Interfaces:**
- Consumes: navega a `UploadDocument` con `docType: DocBase` (Task 5 lo interpreta).

- [ ] **Step 1: Actualizar mapping y lista de documentos (líneas 63-79)**

```typescript
// Maps a backend doc_type back to the UploadDocument screen's docType param.
const DOC_TYPE_TO_UPLOAD: Record<string, string> = {
  license_front: 'drivers_license',
  license_back: 'drivers_license',
  registration_front: 'vehicle_registration',
  registration_back: 'vehicle_registration',
  insurance_front: 'vehicle_insurance',
  insurance_back: 'vehicle_insurance',
  background_check_front: 'background_check',
  background_check_back: 'background_check',
};

// The documents a driver can manage from the profile.
const MANAGEABLE_DOCS: { docType: string; label: string }[] = [
  { docType: 'drivers_license', label: 'Licencia de conducir' },
  { docType: 'vehicle_registration', label: 'Cedula del vehiculo' },
  { docType: 'vehicle_insurance', label: 'Seguro del vehiculo' },
  { docType: 'background_check', label: 'Certificado de antecedentes penales' },
];
```

- [ ] **Step 2: Estado agregado de ambas caras (reemplaza `docStatusLabel`/`docStatusIcon`, líneas 81-92)**

```typescript
function docsStatusLabel(docs: DocumentItem[]): string {
  if (docs.length === 0) return 'No cargado';
  if (docs.some((d) => d.status === 'rejected')) return 'Rechazado';
  if (docs.length < 2) return 'Incompleto: falta una cara';
  if (docs.some((d) => d.status === 'pending_review')) return 'Pendiente de revision';
  if (docs.every((d) => d.verified_at || d.status === 'approved')) return 'Verificado';
  return 'Pendiente';
}

function docsStatusIcon(docs: DocumentItem[]): string {
  if (docs.length === 0) return '➕';
  if (docs.some((d) => d.status === 'rejected')) return '❌';
  if (docs.length === 2 && docs.every((d) => d.verified_at || d.status === 'approved')) return '✅';
  return '⏳';
}
```

- [ ] **Step 3: Actualizar el render (líneas 286-308)**

```tsx
{MANAGEABLE_DOCS.map((managed) => {
  const docsFor = documents.filter(
    (d) => DOC_TYPE_TO_UPLOAD[d.doc_type] === managed.docType,
  );
  return (
    <View key={managed.docType} style={styles.docRow}>
      <Text style={styles.docIcon}>{docsStatusIcon(docsFor)}</Text>
      <View style={styles.docInfo}>
        <Text style={styles.docName}>{managed.label}</Text>
        <Text style={styles.docStatus}>{docsStatusLabel(docsFor)}</Text>
      </View>
      <TouchableOpacity
        onPress={() =>
          navigation.navigate('UploadDocument', {
            docType: managed.docType,
            docLabel: managed.label,
            mode: 'reupload',
          })
        }
      >
        <Text style={styles.docAction}>{docsFor.length > 0 ? 'Volver a subir' : 'Subir'}</Text>
      </TouchableOpacity>
    </View>
  );
})}
```

- [ ] **Step 4: Verificar**

Run: `bunx tsc --noEmit` y `bun run test` (desde `apps/mobile`)
Expected: sin errores / PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/ProfileScreen.tsx
git commit -m "feat(mobile): antecedentes penales y estado por caras en perfil"
```

---

### Task 7: Verificación final

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite completa backend**

Run: `bun test` (desde `apps/backend`)
Expected: PASS, 0 fail.

- [ ] **Step 2: Mobile: tests + typecheck**

Run desde `apps/mobile`: `bun run test` y `bunx tsc --noEmit`
Expected: PASS / sin errores.

- [ ] **Step 3: Lint + typecheck global**

Run desde el root: `bun run check`
Expected: sin errores. Si biome marca formato, correr `bun run format` y commitear.

- [ ] **Step 4: Commit final si hubo fixes**

```bash
git add -A && git commit -m "chore: lint fixes"
```

(solo si hubo cambios)
