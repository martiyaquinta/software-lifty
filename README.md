# software-lifty

Monorepo for the Lifty platform — backend API and mobile app for drivers.

[![CI](https://github.com/martiyaquinta/software-lifty/actions/workflows/ci.yml/badge.svg)](https://github.com/martiyaquinta/software-lifty/actions/workflows/ci.yml)

> **Status: Active Development.** No production deployment, no MVP, no staging. Everything is local/dev only. See `AGENTS.md` for full project context.

## Stack

| Layer | Tech |
|---|---|
| Monorepo | Bun Workspaces + Turborepo |
| Backend | Bun + Elysia + Drizzle ORM + PostgreSQL (Supabase) |
| Mobile | Expo SDK 54 + React 19 + TypeScript |
| Linting | Biome |
| Pre-commit | Lefthook + Commitlint |
| CI | GitHub Actions (turbo) |
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
bun install       # install all dependencies
bun run dev       # start both apps in parallel
bun run check     # lint + typecheck
```

### Per-app

```bash
bun --filter @lifty/backend dev
bun --filter @lifty/mobile dev
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

## Commit conventions

All commits use [Conventional Commits](https://www.conventionalcommits.org/). Valid types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`.

```
feat: add driver onboarding flow
fix: correct trip fare calculation
```

Enforced by commitlint + Lefthook pre-commit.

## Environment

Copy `.env.example` to `.env` in each app and fill in the required values. See each app's `AGENTS.md` for details.
