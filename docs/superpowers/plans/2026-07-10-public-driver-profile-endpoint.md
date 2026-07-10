# Public Driver Profile Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document `GET /api/drivers/:id/profile` as public, apply a stricter per-route rate limit (10 req/min per IP), and reduce exposed personal data to first name only.

**Architecture:** Parametrize the existing `rateLimit` Elysia plugin to accept a distinct `name` and `keyPrefix` so a second, stricter instance can be scoped to just the public profile route. Trim `full_name` to its first token in the service layer. Add swagger `detail` metadata and an AGENTS.md section.

**Tech Stack:** Bun, Elysia, Drizzle ORM, `bun:test`, `@elysiajs/swagger`, ioredis (optional; in-memory fallback in tests).

## Global Constraints

- Runtime: **Bun**. Tests run via `bun test` from `apps/backend`.
- No comments added to code unless already present in surrounding style.
- Conventional Commits for every commit.
- Rate limit defaults: `PUBLIC_PROFILE_RATE_LIMIT_MAX=10`, `PUBLIC_PROFILE_RATE_LIMIT_WINDOW_MS=60000`.
- Public profile payload keeps the key `full_name`, but its value is only the first name token.
- Biome must pass (`bun run lint` from root).

---

## File Structure

- `apps/backend/src/shared/middleware/ratelimit.ts` — add optional `name` + `keyPrefix` to config; use them for plugin name and store/Redis keys.
- `apps/backend/src/features/drivers/routes.ts` — wrap `GET /:id/profile` with a scoped strict rate limiter + swagger `detail`.
- `apps/backend/src/features/drivers/service.ts` — return first name only in `getPublicProfile`.
- `apps/backend/src/features/drivers/drivers.test.ts` — update name assertions; add 429 test.
- `apps/backend/AGENTS.md` — add "Endpoints públicos" section.

---

### Task 1: Parametrize the rate limit plugin

**Files:**
- Modify: `apps/backend/src/shared/middleware/ratelimit.ts`

**Interfaces:**
- Consumes: `getRedis()` from `../lib/redis`.
- Produces: `rateLimit(config?: Partial<RateLimitConfig>)` where
  `RateLimitConfig = { windowMs: number; max: number; name: string; keyPrefix: string }`.
  Defaults: `name='rate-limit'`, `keyPrefix='ratelimit:ip'`. Both Redis and in-memory
  paths key off `keyPrefix`. Plugin `name` uses `config.name`.

- [ ] **Step 1: Update the config interface and resolve name/keyPrefix**

In `apps/backend/src/shared/middleware/ratelimit.ts`, change the interface and the top of `rateLimit`:

```ts
interface RateLimitConfig {
  windowMs: number;
  max: number;
  name: string;
  keyPrefix: string;
}

export function rateLimit(config?: Partial<RateLimitConfig>) {
  const windowMs = (config?.windowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS)) || 60_000;
  const max = (config?.max ?? Number(process.env.RATE_LIMIT_MAX)) || 60;
  const name = config?.name ?? 'rate-limit';
  const keyPrefix = config?.keyPrefix ?? 'ratelimit:ip';
  const redis = getRedis();
```

- [ ] **Step 2: Use `name` for the in-memory plugin and keep per-plugin store**

Replace the in-memory branch's `new Elysia({ name: 'rate-limit' })` with `new Elysia({ name })`. The `store` Map is already a per-call closure, so each plugin instance has its own store — no key collision. Leave the rest of that branch unchanged.

```ts
    return new Elysia({ name }).onBeforeHandle(({ request, set }) => {
```

- [ ] **Step 3: Use `name` and `keyPrefix` for the Redis plugin**

In the Redis branch, change the plugin name and the key:

```ts
  return new Elysia({ name }).onBeforeHandle(async ({ request, set }) => {
    const rawForwarded = request.headers.get('x-forwarded-for');
    const ip = rawForwarded ? rawForwarded.split(',')[0].trim() : '127.0.0.1';
    const key = `${keyPrefix}:${ip}`;
```

Leave the incr/expire/ttl logic unchanged.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck` (from `apps/backend`, or `bun --filter @lifty/backend typecheck` from root)
Expected: PASS (no type errors).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/shared/middleware/ratelimit.ts
git commit -m "refactor: parametrize rate limit plugin name and key prefix"
```

---

### Task 2: Trim public profile to first name

**Files:**
- Modify: `apps/backend/src/features/drivers/service.ts:60-73`
- Test: `apps/backend/src/features/drivers/drivers.test.ts`

**Interfaces:**
- Consumes: existing `getPublicProfile(driverId: string)` query rows.
- Produces: same object shape; `full_name` value is now `row.full_name.split(' ')[0]`.

- [ ] **Step 1: Update the failing test first**

In `apps/backend/src/features/drivers/drivers.test.ts`, change the assertion in
`test('GET /:id/profile returns public profile', ...)` (around line 90):

```ts
    expect(data.full_name).toBe('Juan');
```

(The seed name is `'Juan Perez'`, so first name is `'Juan'`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/drivers/drivers.test.ts -t "returns public profile"` (from `apps/backend`)
Expected: FAIL — `expected "Juan" but got "Juan Perez"`.

- [ ] **Step 3: Implement first-name trimming in the service**

In `apps/backend/src/features/drivers/service.ts`, modify the return of `getPublicProfile` (lines 60-73):

```ts
    return {
      id: row.id,
      full_name: row.full_name ? row.full_name.split(' ')[0] : row.full_name,
      avatar_url: row.avatar_url,
      rating_avg: row.rating_avg,
      total_trips: row.total_trips,
      kyc_verified: row.kyc_status === 'approved',
      vehicle: {
        brand: row.brand,
        model: row.model,
        year: row.year,
        color: row.color,
      },
    };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/drivers/drivers.test.ts -t "returns public profile"` (from `apps/backend`)
Expected: PASS.

- [ ] **Step 5: Check for other affected assertions**

Verify no other test in the file asserts `full_name` on the **public** profile endpoint (`/:id/profile`). The `GET /me` test asserts `full_name === 'Juan Perez'` — that is the authenticated endpoint and must stay `'Juan Perez'`. Do NOT change it. Run the full file:

Run: `bun test src/features/drivers/drivers.test.ts` (from `apps/backend`)
Expected: PASS (all tests).

Also update `apps/backend/src/all-endpoints.test.ts` only if it asserts `full_name` on the public profile — check with:

Run: `grep -n "full_name" src/all-endpoints.test.ts` (from `apps/backend`)
If a public-profile assertion expects the full name, change it to the first name; otherwise leave it.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/features/drivers/service.ts apps/backend/src/features/drivers/drivers.test.ts
git commit -m "feat: expose only first name in public driver profile"
```

---

### Task 3: Apply strict rate limit + swagger detail to the public route

**Files:**
- Modify: `apps/backend/src/features/drivers/routes.ts:1-23`
- Test: `apps/backend/src/features/drivers/drivers.test.ts`

**Interfaces:**
- Consumes: `rateLimit` from Task 1 (`{ name, keyPrefix, max, windowMs }`).
- Produces: `GET /:id/profile` guarded by a `rate-limit-public-profile` instance
  (default 10 req/min per IP, keyPrefix `ratelimit:public-profile:ip`) and annotated
  with swagger `detail`.

- [ ] **Step 1: Write the failing 429 test**

Add this test inside the `describe('Driver Profile', ...)` block in
`apps/backend/src/features/drivers/drivers.test.ts`. It uses a dedicated
`x-forwarded-for` IP so its counter is isolated from other tests sharing the
default `127.0.0.1`:

```ts
  test('GET /:id/profile enforces strict public rate limit', async () => {
    const { driverId } = await fullOnboarding(phone, password);
    const ip = '203.0.113.7';

    const call = async () => {
      const req = new Request(`http://localhost/api/drivers/${driverId}/profile`, {
        method: 'GET',
        headers: { 'x-forwarded-for': ip },
      });
      return app.handle(req);
    };

    let last = 200;
    for (let i = 0; i < 11; i++) {
      const res = await call();
      last = res.status;
    }

    expect(last).toBe(429);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/drivers/drivers.test.ts -t "strict public rate limit"` (from `apps/backend`)
Expected: FAIL — `expected 429 but got 200` (global limit is 100, not reached in 11 calls).

- [ ] **Step 3: Add the imports and scoped limiter in routes.ts**

In `apps/backend/src/features/drivers/routes.ts`, add the import at the top (after the existing imports):

```ts
import { rateLimit } from '../../shared/middleware/ratelimit';
```

Then wrap the public route. Replace lines 15-23 (the `new Elysia(...).use(authGuard).get('/:id/profile', ...)` head) with:

```ts
const publicProfileRateLimit = rateLimit({
  name: 'rate-limit-public-profile',
  keyPrefix: 'ratelimit:public-profile:ip',
  max: Number(process.env.PUBLIC_PROFILE_RATE_LIMIT_MAX) || 10,
  windowMs: Number(process.env.PUBLIC_PROFILE_RATE_LIMIT_WINDOW_MS) || 60_000,
});

export const driversRoutes = new Elysia({ prefix: '/drivers' })
  .use(authGuard)
  .use(publicProfileRateLimit)
  .get(
    '/:id/profile',
    ({ params: { id }, set }) => {
      return safeCall(() => driversService.getPublicProfile(id), set);
    },
    {
      params: driverIdParams,
      detail: {
        tags: ['drivers'],
        summary: 'Perfil público del conductor',
        description:
          'Endpoint PÚBLICO (sin autenticación). Rate limit: 10 req/min por IP. Devuelve solo el primer nombre del conductor.',
      },
    },
  )
```

Note: `publicProfileRateLimit` runs on `onBeforeHandle` for the whole `driversRoutes` group, but its counter is separate (own `keyPrefix`) and stricter. Since the rest of the routes are authenticated and low-traffic, applying it group-wide is acceptable; the 10/min limit primarily protects the public route. Keep the remaining routes (`/me`, etc.) exactly as they are.

- [ ] **Step 4: Run the 429 test to verify it passes**

Run: `bun test src/features/drivers/drivers.test.ts -t "strict public rate limit"` (from `apps/backend`)
Expected: PASS.

- [ ] **Step 5: Run the full drivers suite to confirm no regressions**

Run: `bun test src/features/drivers/drivers.test.ts` (from `apps/backend`)
Expected: PASS. The other profile tests make ≤4 calls on the default `127.0.0.1` IP, well under 10, so they are unaffected.

- [ ] **Step 6: Run the broader endpoint suite**

Run: `bun test src/all-endpoints.test.ts` (from `apps/backend`)
Expected: PASS. It uses a separate app instance (own in-memory store) and makes ≤2 public-profile calls.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/features/drivers/routes.ts apps/backend/src/features/drivers/drivers.test.ts
git commit -m "feat: add strict rate limit and swagger docs to public driver profile"
```

---

### Task 4: Document the public endpoint in AGENTS.md

**Files:**
- Modify: `apps/backend/AGENTS.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a documented "Endpoints públicos" section.

- [ ] **Step 1: Add the section**

In `apps/backend/AGENTS.md`, add a new section after the `## Auth` section:

```markdown
## Endpoints públicos

`GET /api/drivers/:id/profile` es el **único endpoint sin autenticación** de la API. Expone
el perfil público del conductor para que un pasajero pueda verlo.

- **Sin auth**: no requiere JWT.
- **Rate limit propio**: 10 req/min por IP (más estricto que el global de 100). Configurable
  con `PUBLIC_PROFILE_RATE_LIMIT_MAX` y `PUBLIC_PROFILE_RATE_LIMIT_WINDOW_MS`.
- **Datos expuestos**: `full_name` (solo primer nombre), `avatar_url`, `rating_avg`,
  `total_trips`, `kyc_verified`, y datos del vehículo (`brand`, `model`, `year`, `color`).
  No expone teléfono, email, patente ni identidad completa.

Cualquier endpoint público nuevo debe documentarse aquí y llevar su propio rate limit.
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/AGENTS.md
git commit -m "docs: document public driver profile endpoint in AGENTS.md"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run the full backend test suite**

Run: `bun test` (from `apps/backend`)
Expected: PASS (all suites).

- [ ] **Step 2: Lint and typecheck**

Run (from repo root): `bun run lint && bun run typecheck`
Expected: both PASS.

- [ ] **Step 3: (Optional) Verify swagger renders the detail**

Run `bun run dev` from `apps/backend`, open `http://localhost:3000/docs`, confirm the
`GET /drivers/{id}/profile` entry shows the public description. Stop the server after.
