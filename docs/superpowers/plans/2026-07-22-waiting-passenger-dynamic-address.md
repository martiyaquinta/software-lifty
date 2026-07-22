# Fix WaitingPassengerScreen Hardcoded Address — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded address `"Av. San Martin 450"` in `WaitingPassengerScreen` with dynamic `trip.origin_address` from the trip store.

**Architecture:** Read `trip` from existing `useTripStore` zustand store (already imported), render `trip?.origin_address` with `'Origen'` fallback — same pattern used by `IncomingRequestScreen` and `NavigationScreen`.

**Tech Stack:** React Native, Zustand, TypeScript

**Spec:** `docs/superpowers/specs/2026-07-22-waiting-passenger-dynamic-address-design.md`

**Issue:** #94

## Global Constraints

- Follow existing patterns: other screens use `trip?.origin_address ?? 'Origen'`
- `useTripStore` is already imported, `trip` field already exists in the store
- Trip is guaranteed to exist at this screen — no null-guard redirect needed

---

### Task 1: Create feature branch and apply fix

**Files:**
- Modify: `apps/mobile/src/screens/WaitingPassengerScreen.tsx:38,152`

**Interfaces:**
- Consumes: `useTripStore.trip.origin_address` (string | null, already in store)
- Produces: n/a (self-contained render change)

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b fix/waiting-passenger-dynamic-address-94
```

- [ ] **Step 2: Add trip selector to the component**

In `apps/mobile/src/screens/WaitingPassengerScreen.tsx`, after line 37 (`const clearTrip = useTripStore((s) => s.clearTrip);`), add:

```tsx
const trip = useTripStore((s) => s.trip);
```

- [ ] **Step 3: Replace hardcoded address**

In `apps/mobile/src/screens/WaitingPassengerScreen.tsx`, replace line 152:

```diff
-       <Text style={styles.address}>en Av. San Martin 450</Text>
+       <Text style={styles.address}>en {trip?.origin_address ?? 'Origen'}</Text>
```

- [ ] **Step 4: Run typecheck**

```bash
bun --filter @lifty/mobile typecheck
```
Expected: PASS, no errors.

- [ ] **Step 5: Commit the fix**

```bash
git add apps/mobile/src/screens/WaitingPassengerScreen.tsx
git commit -m "fix(mobile): use dynamic origin_address in WaitingPassengerScreen (#94)"
```

- [ ] **Step 6: Push and create PR**

```bash
git push -u origin fix/waiting-passenger-dynamic-address-94
gh pr create --title "fix(mobile): use dynamic origin_address in WaitingPassengerScreen" --body "Closes #94. Reemplaza dirección hardcodeada \`Av. San Martin 450\` por \`trip?.origin_address\` del store, con fallback \`'Origen'\`. Mismo patrón que IncomingRequestScreen y NavigationScreen." --label "bug,mobile"
```
