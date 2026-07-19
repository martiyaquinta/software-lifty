# Email-Based Driver Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace UnderReview polling with email-based admin approval + push notification.

**Architecture:** DB migration adds `approval_token`+`approved_at` columns. Backend generates UUID token on document submission, emails it to admin with full driver data. Public `GET /api/admin/approve?token=<uuid>` approves driver and sends push. Mobile: KYCWebView→OnboardingVehicle (skip UnderReview), OnboardingStep2→WaitingApproval (new screen), push token registration.

**Tech Stack:** Bun+Elysia+Drizzle+Resend+FCM (backend), Expo SDK 56+expo-router+expo-notifications (mobile).

## Global Constraints
- Conventional commits, biome+commitlint pre-commit, typecheck must pass
- Mobile: use `theme.colors.*`, `theme.spacing.*`, `theme.fontSize.*` from `src/theme/index.ts`
- Backend: use `safeCall` wrapper, `AppError`/`NotFoundError`, `logger`

---

### Task 1: DB Migration — Add `approval_token` and `approved_at` to `drivers`

**Files:**
- Create: `apps/backend/supabase/migrations/<timestamp>_approval_token.sql`
- Modify: `apps/backend/src/shared/db/schema/drivers.ts`

- [ ] **Step 1: Create migration file**

```bash
cd apps/backend && supabase migration new approval_token
```

- [ ] **Step 2: Write SQL** into the generated migration file:

```sql
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS approval_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;
```

- [ ] **Step 3: Push to remote**

```bash
cd apps/backend && supabase db push
```

- [ ] **Step 4: Update Drizzle schema** — edit `apps/backend/src/shared/db/schema/drivers.ts`, add after `admin_review_notes`:

```ts
  approval_token: text('approval_token').unique(),
  approved_at: timestamp('approved_at'),
```

- [ ] **Step 5: Typecheck**

```bash
bun --filter @lifty/backend typecheck
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/supabase/migrations/<timestamp>_approval_token.sql apps/backend/src/shared/db/schema/drivers.ts
git commit -m "feat: add approval_token and approved_at columns to drivers"
```

---

### Task 2: Backend — Admin approval endpoint

**Files:**
- Create: `apps/backend/src/features/admin/approve.ts`
- Modify: `apps/backend/src/features/admin/routes.ts`
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Create `apps/backend/src/features/admin/approve.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { drivers } from '../../shared/db/schema';
import { driverDocuments } from '../../shared/db/schema/driver-documents';
import { users } from '../../shared/db/schema/users';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { sendPushToUser } from '../../shared/lib/push';

export async function approveDriver(token: string): Promise<{ message: string }> {
  const [driver] = await db
    .select({
      id: drivers.id,
      user_id: drivers.user_id,
      status: drivers.status,
    })
    .from(drivers)
    .where(eq(drivers.approval_token, token))
    .limit(1);

  if (!driver) {
    throw new NotFoundError('Token de aprobacion invalido o ya usado');
  }

  if (driver.status === 'approved') {
    throw new AppError('Este conductor ya fue aprobado', 400, 'ALREADY_APPROVED');
  }

  const now = new Date();

  await db
    .update(drivers)
    .set({
      status: 'approved',
      admin_review_status: 'approved',
      approval_token: null,
      approved_at: now,
      admin_reviewed_at: now,
      documents_pending_review: false,
      updated_at: now,
    })
    .where(eq(drivers.id, driver.id));

  await db
    .update(driverDocuments)
    .set({ status: 'approved', verified_at: now })
    .where(
      and(
        eq(driverDocuments.driver_id, driver.id),
        eq(driverDocuments.status, 'pending_review'),
      ),
    );

  const [userRow] = await db
    .select({ full_name: users.full_name })
    .from(users)
    .where(eq(users.id, driver.user_id))
    .limit(1);

  logger.info('[ADMIN-APPROVE] Driver approved', { driverId: driver.id.split('-')[0] });

  sendPushToUser(driver.user_id, {
    title: 'Cuenta aprobada',
    body: 'Tu cuenta fue aprobada. Ya podes empezar a usar Lifty.',
    data: { type: 'kyc:approved' },
  }).catch((err) => {
    logger.error('[ADMIN-APPROVE] Push failed', (err as Error).message);
  });

  return { message: `Conductor ${userRow?.full_name ?? driver.id} aprobado. Ya puede usar la app.` };
}
```

- [ ] **Step 2: Add public route** — edit `apps/backend/src/features/admin/routes.ts`, add before existing exports:

```ts
import { Elysia } from 'elysia';
import { safeCall } from '../../shared/lib/route-utils';
import { approveDriver } from './approve';

export const adminApproveRoute = new Elysia().get(
  '/admin/approve',
  ({ query, set }) => {
    const token = (query as any)?.token;
    if (!token) {
      set.status = 400;
      return { error: { code: 'BAD_REQUEST', message: 'Token is required', status: 400 } };
    }
    return safeCall(() => approveDriver(String(token)), set);
  },
);
```

Keep the existing `adminRoutes` export unchanged after this.

- [ ] **Step 3: Register in `apps/backend/src/index.ts`** — add import and use in `/api` group:

Add import near other admin imports:
```ts
import { adminApproveRoute, adminRoutes } from './features/admin/routes';
```

In the `/api` group, add `adminApproveRoute` before `adminRoutes`:
```ts
  .use(adminApproveRoute)
  .use(adminRoutes)
```

- [ ] **Step 4: Typecheck**

```bash
bun --filter @lifty/backend typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/features/admin/approve.ts apps/backend/src/features/admin/routes.ts apps/backend/src/index.ts
git commit -m "feat: add public admin approve endpoint with push notification"
```

---

### Task 3: Backend — Email with driver data on document completion

**Files:**
- Modify: `apps/backend/src/features/admin/notifications.ts`
- Modify: `apps/backend/src/features/drivers/service.ts`

- [ ] **Step 1: Add `notifyAdminNewDriver` to `apps/backend/src/features/admin/notifications.ts`**

Add these imports at the top:
```ts
import { and, eq, ne } from 'drizzle-orm';
import { vehicles } from '../../shared/db/schema/vehicles';
```

Add this function at the end of the file (after `notifyDriverRejected`):

```ts
function generateApprovalToken(): string {
  return crypto.randomUUID();
}

async function gatherDriverData(driverId: string): Promise<{
  fullName: string;
  phone: string;
  email: string | null;
  kycStatus: string;
  verifiedName: string | null;
  vehicle: { type: string; plate: string; brand: string; model: string; year: number; color: string } | null;
  documents: Array<{ type: string; front: string | null; back: string | null }>;
} | null> {
  const [d] = await db
    .select({
      fullName: users.full_name,
      phone: users.phone,
      email: users.email,
      kycStatus: users.kyc_status,
      verifiedName: users.verified_name,
      vehicleType: vehicles.vehicle_type,
      vehiclePlate: vehicles.plate,
      vehicleBrand: vehicles.brand,
      vehicleModel: vehicles.model,
      vehicleYear: vehicles.year,
      vehicleColor: vehicles.color,
    })
    .from(drivers)
    .innerJoin(users, eq(users.id, drivers.user_id))
    .leftJoin(vehicles, eq(vehicles.driver_id, drivers.id))
    .where(eq(drivers.id, driverId))
    .limit(1);

  if (!d) return null;

  const rawDocs = await db
    .select({ doc_type: driverDocuments.doc_type, file_url: driverDocuments.file_url })
    .from(driverDocuments)
    .where(
      and(
        eq(driverDocuments.driver_id, driverId),
        ne(driverDocuments.status, 'superseded'),
        ne(driverDocuments.status, 'rejected'),
      ),
    );

  const docMap: Record<string, { front: string | null; back: string | null }> = {};
  for (const doc of rawDocs) {
    const isBack = doc.doc_type.endsWith('_back');
    const isFront = doc.doc_type.endsWith('_front');
    if (!isBack && !isFront) continue;
    const base = doc.doc_type.replace(/_(front|back)$/, '');
    if (!docMap[base]) docMap[base] = { front: null, back: null };
    if (isFront) docMap[base].front = doc.file_url;
    else docMap[base].back = doc.file_url;
  }

  const documentLabelMap: Record<string, string> = {
    license: 'Licencia de conducir',
    registration: 'Cedula del vehiculo',
    insurance: 'Seguro del vehiculo',
    background_check: 'Certificado de antecedentes',
  };

  return {
    fullName: d.fullName ?? 'Sin nombre',
    phone: d.phone ?? 'Sin telefono',
    email: d.email,
    kycStatus: d.kycStatus,
    verifiedName: d.verifiedName,
    vehicle: d.vehicleType
      ? { type: d.vehicleType, plate: d.vehiclePlate ?? '', brand: d.vehicleBrand ?? '', model: d.vehicleModel ?? '', year: d.vehicleYear ?? 0, color: d.vehicleColor ?? '' }
      : null,
    documents: Object.entries(docMap).map(([type, urls]) => ({
      type: documentLabelMap[type] ?? type,
      front: urls.front,
      back: urls.back,
    })),
  };
}

export async function notifyAdminNewDriver(driverId: string): Promise<void> {
  try {
    const data = await gatherDriverData(driverId);
    if (!data) return;

    const token = generateApprovalToken();
    await db.update(drivers).set({ approval_token: token }).where(eq(drivers.id, driverId));

    const adminRows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.role, 'admin'));

    const recipients = new Set([
      ...adminRows.map((r) => r.email).filter((e): e is string => !!e),
      ...adminEmailsFromEnv(),
    ]);

    if (recipients.size === 0) {
      logger.info('[ADMIN-NOTIFY] No admin recipients configured');
      return;
    }

    const apiUrl = process.env.API_URL ?? 'http://localhost:3000/api';
    const approveUrl = `${apiUrl}/admin/approve?token=${token}`;

    const vehicleHtml = data.vehicle
      ? `<tr><td><strong>Vehiculo</strong></td><td>${data.vehicle.brand} ${data.vehicle.model} (${data.vehicle.year}) — ${data.vehicle.color} — Patente: ${data.vehicle.plate} — Tipo: ${data.vehicle.type}</td></tr>`
      : '';

    const docsHtml = data.documents
      .map((d) => `<tr><td><strong>${d.type}</strong></td><td>${d.front ? `<a href="${d.front}">Frente</a>` : '—'} ${d.back ? `| <a href="${d.back}">Dorso</a>` : ''}</td></tr>`)
      .join('');

    const subject = `Nuevo conductor: ${data.fullName}`;
    const html = `<h2>Nuevo conductor registrado</h2>
<table style="border-collapse:collapse;width:100%;max-width:600px">
<tr><td style="padding:8px;border:1px solid #ddd"><strong>Nombre</strong></td><td style="padding:8px;border:1px solid #ddd">${data.fullName}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd"><strong>Telefono</strong></td><td style="padding:8px;border:1px solid #ddd">${data.phone}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd"><strong>Email</strong></td><td style="padding:8px;border:1px solid #ddd">${data.email ?? '—'}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd"><strong>Verificado (DIDIT)</strong></td><td style="padding:8px;border:1px solid #ddd">${data.verifiedName ?? '—'}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd"><strong>Estado KYC</strong></td><td style="padding:8px;border:1px solid #ddd">${data.kycStatus}</td></tr>
${vehicleHtml}
${docsHtml}
</table>
<br/>
<a href="${approveUrl}" style="display:inline-block;padding:12px 24px;background:#00C2B3;color:white;text-decoration:none;border-radius:6px;font-weight:bold">Aceptar conductor</a>
<br/><br/>
<p style="color:#888;font-size:12px">ID: ${driverId}</p>`;

    for (const email of recipients) {
      await sendEmail(email, subject, html);
    }
  } catch (err) {
    logger.error('[ADMIN-NOTIFY] Failed to send', (err as Error).message);
  }
}
```

Also add the missing import for `driverDocuments` and `drivers` (they're already used in the file context — add if missing at the top).

Add import:
```ts
import { driverDocuments } from '../../shared/db/schema/driver-documents';
```

And `drivers` — check if already imported (it's used in the function now). If not, add:
```ts
import { drivers } from '../../shared/db/schema';
```

- [ ] **Step 2: Call `notifyAdminNewDriver` in `addDocument` and `reuploadDocument`**

In `apps/backend/src/features/drivers/service.ts`, add import at top:
```ts
import { notifyAdminNewDriver } from '../admin/notifications';
```

In `addDocument` method, replace:
```ts
      notifyAdminsNewDocuments(userRow?.full_name ?? 'Driver', driver.id);
```
with:
```ts
      notifyAdminNewDriver(driver.id);
```

In `reuploadDocument` method, replace the same call:
```ts
      notifyAdminsNewDocuments(userRow?.full_name ?? 'Driver', driver.id);
```
with:
```ts
      notifyAdminNewDriver(driver.id);
```

- [ ] **Step 3: Typecheck**

```bash
bun --filter @lifty/backend typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/features/admin/notifications.ts apps/backend/src/features/drivers/service.ts
git commit -m "feat: send detailed driver data email with approval link on document submission"
```

---

### Task 4: Mobile — Register push token with backend

**Files:**
- Modify: `apps/mobile/src/components/AppInitializer.tsx`

- [ ] **Step 1: Send push token to backend on registration**

Edit `apps/mobile/src/components/AppInitializer.tsx`, locate the `NotificationSetup` component. The `registerForPush()` call currently only logs the token. Add a POST to `/notifications/token` after getting it.

Find the `registerForPush().then(...)` block (around line 130) and change from:

```tsx
    registerForPush().then((token) => {
      if (token) {
        console.log('Expo push token:', token);
      }
    });
```

To:

```tsx
    registerForPush().then(async (token) => {
      if (token) {
        try {
          const { default: axios } = await import('axios');
          const Constants = (await import('expo-constants')).default;
          const hostUri = Constants.expoConfig?.hostUri;
          const port = process.env.EXPO_PUBLIC_API_PORT ?? '3000';
          const host = hostUri?.split(':')[0] ?? 'localhost';
          await axios.post(`http://${host}:${port}/api/notifications/token`, {
            token,
            platform: Platform.OS,
          });
        } catch {
          // Silently fail — token registration is best-effort
        }
      }
    });
```

- [ ] **Step 2: Typecheck**

```bash
bun --filter @lifty/mobile typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/AppInitializer.tsx
git commit -m "feat: register push token with backend on startup"
```

---

### Task 5: Mobile — Skip UnderReview after KYC, go to Vehicle

**Files:**
- Modify: `apps/mobile/src/screens/KYCWebViewScreen.tsx`

- [ ] **Step 1: Navigate to OnboardingVehicle instead of UnderReview**

In `KYCWebViewScreen.tsx`, change the `finish` function. It currently navigates to `UnderReview`. Change it to navigate to `OnboardingVehicle`:

```tsx
  const finish = () => {
    if (done) return;
    setDone(true);
    navigation.navigate('OnboardingVehicle');
  };
```

- [ ] **Step 2: Typecheck**

```bash
bun --filter @lifty/mobile typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/KYCWebViewScreen.tsx
git commit -m "feat: navigate to OnboardingVehicle after KYC instead of UnderReview"
```

---

### Task 6: Mobile — Create WaitingApprovalScreen

**Files:**
- Create: `apps/mobile/src/screens/WaitingApprovalScreen.tsx`
- Create: `apps/mobile/app/waiting-approval.tsx`
- Modify: `apps/mobile/src/hooks/useAppNavigation.ts`
- Modify: `apps/mobile/src/lib/postAuthRouting.ts`

- [ ] **Step 1: Create `apps/mobile/src/screens/WaitingApprovalScreen.tsx`**

```tsx
import type React from 'react';
import { BackHandler, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Navbar } from '../components/Navbar';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export const WaitingApprovalScreen: React.FC = () => {
  const navigation = useAppNavigation();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Revision" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.clockIcon}>⏳</Text>
        </View>
        <Text style={styles.title}>Tus datos fueron enviados</Text>
        <Text style={styles.subtitle}>
          Un administrador revisara tu informacion y documentos. Te notificaremos cuando tu cuenta este aprobada.
        </Text>
      </View>
      <Button
        title="Salir"
        variant="secondary"
        onPress={() => BackHandler.exitApp()}
        style={styles.exitButton}
      />
      {__DEV__ && (
        <Button
          title="Saltar >> Online (DEV)"
          variant="cta"
          onPress={() => navigation.replace('Online')}
          style={styles.exitButton}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(0, 194, 179, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    width: 280,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    textAlign: 'center',
    width: 280,
    lineHeight: 24,
  },
  exitButton: {
    alignSelf: 'center',
    marginBottom: theme.spacing.lg,
  },
});
```

- [ ] **Step 2: Create route file `apps/mobile/app/waiting-approval.tsx`**

```tsx
import { WaitingApprovalScreen } from '../src/screens/WaitingApprovalScreen';

export default WaitingApprovalScreen;
```

- [ ] **Step 3: Add route to `useAppNavigation.ts`** — add after `UnderReview` entry:

```ts
  WaitingApproval: '/waiting-approval',
```

And add `'waiting-approval': 'OnboardingStep2'` to `BACK_FALLBACK`:

```ts
  'waiting-approval': 'OnboardingStep2',
```

- [ ] **Step 4: Update `postAuthRouting.ts`** — change `review` routing:

```ts
  review: { screen: 'WaitingApproval', storeStatus: 'under_review' },
```

- [ ] **Step 5: Update `OnboardingStep2Screen.tsx`** `handleVerify` — navigate to `WaitingApproval`:

```ts
  const handleVerify = useCallback(() => {
    navigation.navigate('WaitingApproval');
  }, [navigation]);
```

- [ ] **Step 6: Typecheck**

```bash
bun --filter @lifty/mobile typecheck
```

Expected: PASS

- [ ] **Step 7: Run lint on changed files**

```bash
bun run lint
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/screens/WaitingApprovalScreen.tsx apps/mobile/app/waiting-approval.tsx apps/mobile/src/hooks/useAppNavigation.ts apps/mobile/src/lib/postAuthRouting.ts apps/mobile/src/screens/OnboardingStep2Screen.tsx
git commit -m "feat: add WaitingApproval screen replacing UnderReview in onboarding flow"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Run all tests**

```bash
bun run test
```

- [ ] **Step 2: Run full typecheck**

```bash
bun run typecheck
```

- [ ] **Step 3: Run lint**

```bash
bun run lint
```

Expected: PASS for all three.

---

## Summary of all changes

| File | Action |
|------|--------|
| `supabase/migrations/<ts>_approval_token.sql` | CREATE — new columns |
| `src/shared/db/schema/drivers.ts` | MODIFY — add `approval_token`, `approved_at` |
| `src/features/admin/approve.ts` | CREATE — public approve endpoint handler |
| `src/features/admin/routes.ts` | MODIFY — add `adminApproveRoute` export |
| `src/features/admin/notifications.ts` | MODIFY — add `notifyAdminNewDriver`, `generateApprovalToken` |
| `src/features/drivers/service.ts` | MODIFY — call `notifyAdminNewDriver` in `addDocument`/`reuploadDocument` |
| `src/index.ts` | MODIFY — register `adminApproveRoute` |
| `src/components/AppInitializer.tsx` | MODIFY — send push token to backend |
| `src/screens/KYCWebViewScreen.tsx` | MODIFY — navigate to `OnboardingVehicle` |
| `src/screens/WaitingApprovalScreen.tsx` | CREATE — new waiting screen |
| `app/waiting-approval.tsx` | CREATE — expo-router route |
| `src/hooks/useAppNavigation.ts` | MODIFY — add `WaitingApproval` route |
| `src/lib/postAuthRouting.ts` | MODIFY — `review` → `WaitingApproval` |
| `src/screens/OnboardingStep2Screen.tsx` | MODIFY — navigate to `WaitingApproval` |
