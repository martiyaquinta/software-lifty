# Arquitectura — Lifty

## Monorepo (`software-lifty/`)

```
software-lifty/
├── apps/
│   ├── backend/       # @lifty/backend — Elysia API
│   │   ├── src/
│   │   │   ├── features/      # Feature-oriented: auth, drivers, trips, etc.
│   │   │   ├── shared/        # DB, middleware, lib compartido
│   │   │   └── index.ts       # Entry point
│   │   └── ...
│   └── mobile/        # @lifty/mobile — Expo app
│       ├── app/               # File-based routes (expo-router)
│       ├── src/
│       │   ├── screens/       # Screen components
│       │   ├── components/    # UI: Button, Input, Card, etc.
│       │   ├── hooks/         # useAuth, useAppNavigation
│       │   ├── store/         # Zustand stores (auth, location, online)
│       │   ├── api/           # API client + types
│       │   └── theme/         # Design system (colores, spacing, etc.)
│       └── ...
├── specs/              # Specs técnicas
├── turbo.json
├── biome.json
└── package.json
```

## Backend (Elysia)

- **REST** en `/api/*`
- **WebSocket** en `/ws/location`
- **Auth**: JWT (jose), refresh tokens en DB. Migrando a Supabase Auth como single source of truth.
- **DB**: PostgreSQL via Drizzle ORM. 17 tablas.
- **Tests**: 194 tests, 17 suites.

## Mobile (Expo)

- **expo-router** file-based routing (21 rutas)
- **Zustand** para estado global (auth, location, online)
- **TanStack Query** para data fetching
- **Tema** unificado en `src/theme/index.ts`
