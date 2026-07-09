# Lifty — Monorepo

**IMPORTANT — PROJECT STATUS**: Lifty is in **active development**. There is NO production deployment, NO MVP, NO staging environment. No CD pipeline exists. All infrastructure is local/dev-only. Do NOT attempt to deploy or configure production services. The backend runs on `localhost`, the mobile app uses Expo Go in development mode. This status applies until explicitly changed in this file.

## Stack
- **Monorepo**: Bun Workspaces + Turborepo
- **Backend**: Bun + Elysia + Drizzle ORM + PostgreSQL (Supabase) — `apps/backend`
- **Mobile**: Expo SDK 54 + React 19 + react-native 0.81 — `apps/mobile`
- **Pre-commit**: Lefthook (biome on staged files) + Commitlint (conventional commits)
- **CI**: GitHub Actions (lint, typecheck, test via turbo)

## Development Workflow

### Branch protection
- `main` is **protected** — never push directly. All changes via PR.
- CI must pass before merge (lint + typecheck + test).
- Deletion and force push are blocked.
- Configured via GitHub Rulesets.

### Commit conventions
All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat: add driver onboarding flow
fix: correct trip fare calculation
docs: update API endpoints
chore: upgrade dependencies
refactor: extract auth middleware
test: add SOS endpoint coverage
```
Enforced by commitlint via Lefthook on `commit-msg`. Invalid messages are rejected.

### Pre-commit hooks (Lefthook)
On every commit, Lefthook runs:
- `biome check --fix` on staged `*.ts`, `*.tsx`, `*.js`, `*.json` files
- `commitlint` validates the commit message format

Hooks are skipped on merge and rebase.

## Commands (from root)
```bash
bun install            # install all deps
bun run dev            # turbo dev (both apps in parallel)
bun run typecheck      # turbo typecheck (both apps)
bun run test           # turbo test (both apps)
bun run lint           # biome check all
bun run format         # biome format all
bun run check          # lint + typecheck
bun run clean          # turbo clean
```

### Per-app commands
```bash
bun --filter @lifty/backend dev
bun --filter @lifty/mobile dev
```

## Directory layout
```
software-lifty/
├── apps/
│   ├── backend/       # @lifty/backend — Elysia API
│   └── mobile/        # @lifty/mobile — Expo app
├── specs/             # Product specs
├── turbo.json         # Turborepo pipeline
├── biome.json         # Linter + formatter config
├── lefthook.yml       # Pre-commit hooks config
├── commitlint.config.js
├── .github/workflows/ci.yml
└── package.json       # Root workspace config
```

## CI/CD

### What CI does (GitHub Actions)
- **lint**: Biome check on every push/PR
- **typecheck**: `tsc --noEmit` on both projects
- **test**: Backend tests with PostgreSQL + Redis services (depends on lint + typecheck passing first)
- **Turbo cache**: Cached between runs via `actions/cache`

### What we DON'T have (by design — no production yet)
- No CD pipeline (no Docker registry, no EAS builds, no deployment)
- No staging/production environments
- No versioned releases
- No changelog automation

## Per-project details

### Backend (`apps/backend`)
See `apps/backend/AGENTS.md` for full backend docs.
Quick ref:
- `bun run dev` — hot reload
- Auth: JWT propio (jose), refresh tokens en DB
- DB: Supabase + Drizzle, migraciones via Supabase CLI
- Redis para rate limiting y cache de ubicacion
- Resend para emails

### Mobile (`apps/mobile`)
See `apps/mobile/AGENTS.md` for full mobile docs.
Quick ref:
- Expo SDK 54, React 19.2, react-native 0.81, TypeScript 6.0
- expo-router (file-based routing)
- React Compiler enabled
- Theme: `src/theme/index.ts`, usar siempre `theme.colors.*`, etc.

## Tech Debt
1. ~~**Backend test script**: `"test": "echo \"Error: no test specified\"` — arreglar para que corra los 194 tests existentes~~ ✅ arreglado (`"test": "bun test"`, 206 tests)
2. ~~**Frontend test script**: Jest instalado pero sin script `test` en package.json — agregarlo~~ ✅ arreglado (PR #28: `"test": "jest"`, 6/6 tests pasando)
3. **Shared tsconfig**: `tsconfig.base.json` en root para extender en ambos proyectos

## Features pendientes (para más adelante)

### Push notifications al conductor cuando llega un viaje
Diferido. Estado actual y lo que falta:
- Backend: `sendPush`/`sendPushToUser` (`apps/backend/src/shared/lib/push.ts`) implementados pero **usan FCM directo** (token nativo de Firebase). En dev (`NODE_ENV !== 'production'`) solo loguean `[PUSH]`, no envían.
- Mobile: `registerForPush` (`apps/mobile/src/lib/notifications.ts`) genera un **Expo push token** (`ExponentPushToken[...]`), **incompatible con la API FCM v1** del backend. Hay que decidir transporte: **Expo Push API** (simple, matchea el token) vs FCM nativo.
- Gap: el token que devuelve `registerForPush` **nunca se envía** al backend (`NotificationSetup` en `app/_layout.tsx` solo hace `console.log`). Falta `POST /notifications/token`.
- Gap: `sendPushToUser` **no se llama** desde el flujo de trips (no hay dispatch al crear el `request_received`).
- Bloqueo de entorno: **Expo Go no soporta remote push** (Android desde SDK 53). Requiere **development build** + `eas init` para tener `projectId` (UUID real). Hoy `registerForPush` hace no-op si no hay `projectId`.

### Google OAuth: branding + clientes nativos (fase builds/stores)
- La pantalla de consentimiento muestra el dominio `*.supabase.co` en vez de "Lifty". Para mostrar el nombre/logo hace falta **Supabase Custom Domain add-on (pago)** + dominio propio verificado en Google Search Console + actualizar redirect URI del cliente OAuth.
- Para los builds nativos (App Store / Play Store) se necesitan **OAuth Client IDs separados de iOS y Android** en Google Cloud (además del Web actual), y el redirect por scheme `lifty://auth-callback`.
- Rotar el Client Secret de Google antes de producción (se expuso en desarrollo).
