# Lifty — Monorepo

## Stack
- **Monorepo**: Bun Workspaces + Turborepo
- **Backend**: Bun + Elysia + Drizzle ORM + PostgreSQL (Supabase) — `apps/backend`
- **Mobile**: Expo SDK 54 + React 19 + react-native 0.81 — `apps/mobile`

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
software/
├── apps/
│   ├── backend/       # @lifty/backend — Elysia API
│   └── mobile/        # @lifty/mobile — Expo app
├── specs/             # Product specs
├── turbo.json         # Turborepo pipeline
├── biome.json         # Linter + formatter config
└── package.json       # Root workspace config
```

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

## Tech Debt (post-migration)
1. **Backend test script**: `"test": "echo \"Error: no test specified\"` — arreglar para que corra los 194 tests existentes
2. **Frontend test script**: Jest instalado pero sin script `test` en package.json — agregarlo
3. **Pre-commit hooks**: Husky + lint-staged para lint + typecheck antes de commit
4. **CI/CD pipeline**: GitHub Actions con `turbo build`, `turbo test`, `turbo lint`
5. **Shared tsconfig**: `tsconfig.base.json` en root para extender en ambos proyectos
6. **GitHub Workflows**: Consolidar `.github/workflows/` a nivel root (actualmente en `apps/backend/`)
