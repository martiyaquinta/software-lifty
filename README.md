# software-lifty

Monorepo for the Lifty platform — backend API and mobile app for drivers.

## Stack

| Layer | Tech |
|---|---|
| Monorepo | Bun Workspaces + Turborepo |
| Backend | Bun + Elysia + Drizzle ORM + PostgreSQL (Supabase) |
| Mobile | Expo SDK 54 + React 19 + TypeScript |
| Linting | Biome |
| Auth | JWT (jose) + refresh tokens |
| Email | Resend |
| Cache | Redis (ioredis) |

## Structure

```
apps/
├── backend/    # @lifty/backend — REST + WebSocket API
└── mobile/     # @lifty/mobile — Expo app with expo-router
specs/          # Product specs
```

## Getting Started

```bash
# Install dependencies
bun install

# Run both apps in development
bun run dev

# TypeScript check
bun run typecheck

# Lint + format
bun run check
```

### Per-app

```bash
bun --filter @lifty/backend dev    # backend only
bun --filter @lifty/mobile dev     # mobile only
```

## Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start both apps in parallel (turbo) |
| `bun run typecheck` | TypeScript check both projects |
| `bun run test` | Run tests (turbo) |
| `bun run lint` | Biome check |
| `bun run format` | Biome format |
| `bun run check` | lint + typecheck |
| `bun run clean` | Clean turbo cache |

## Environment

Copy `.env.example` to `.env` in each app and fill in the required values. See each app's `AGENTS.md` for details.
