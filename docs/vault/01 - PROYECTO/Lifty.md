# Lifty

> **Status:** Active Development | **MVP:** Driver-side (conductor)  
> **Monorepo:** `~/Projects/lifty/software-lifty/`

## Stack

| Capa | Tecnología |
|------|-----------|
| Monorepo | Bun Workspaces + Turborepo |
| Backend | Bun + Elysia + Drizzle ORM + PostgreSQL (Supabase) |
| Mobile | Expo SDK 54 + React 19 + TypeScript + expo-router |
| Auth | JWT (jose) + refresh tokens (migrando a Supabase Auth) |
| Infra | Docker (Postgres 16 + Redis 7), GitHub Actions CI |

## Apps

- **`apps/backend/`** — API REST + WebSocket (Elysia). Puerto 3000.
- **`apps/mobile/`** — App conductor Expo. expo-router, 21 screens.

## Estructura del Vault

| Carpeta | Contenido |
|---------|-----------|
| `01 - PROYECTO/` | Gestión activa: Lifty.md, Pricing, Roles, Decisiones, Sprint |
| `02 - WDS/` | Flujo de diseño: Product Brief → Trigger Map → UX Scenarios |
| `03 - REFERENCIAS/` | Pantallas (HTML), Diagramas, Investigación |
| `04 - ARCHIVO/` | Cerrado / obsoleto |
| `Templates/` | Plantillas para notas |

## Enlaces rápidos

- [Roadmap](./01%20-%20PROYECTO/Roadmap.md)
- [Arquitectura](./02%20-%20WDS/Arquitectura.md)
- [Decisiones de Arquitectura](./01%20-%20PROYECTO/Decisiones.md)
- [Especificación Auth Supabase](./03%20-%20REFERENCIAS/SPEC-auth-supabase-migration.md)
