# Lifty — Backend (Bun + Elysia + Drizzle)

## Stack
- **Bun** runtime, **Elysia** HTTP framework, **Drizzle ORM** + **PostgreSQL** (Supabase)
- **Supabase** para DB hosting y Storage (documentos de conductores)
- **Resend** para emails transaccionales (verificacion de cuenta)
- Auth: JWT propio (`jose`), `Bun.password` para hashing, refresh tokens en DB
- Redis (ioredis) para rate limiting y cache de ubicacion

## Commands
```bash
bun run dev          # desarrollo con hot reload
bun test             # correr tests (194 tests, 17 suites)
```

## Auth
- `POST /auth/register` → crea usuario (unverified), envia codigo de 6 digitos por Resend
- `POST /auth/verify` → verifica email con codigo
- `POST /auth/login` → devuelve JWT (access 15min + refresh 30d)
- `POST /auth/refresh` → rota refresh token
- `GET /auth/me` → datos del usuario autenticado
- `POST /auth/logout` → revoca todos los refresh tokens
- Variables requeridas: `JWT_SECRET` (min 32 chars), `RESEND_API_KEY`, `DATABASE_URL`

## Migraciones

### Setup inicial
El proyecto usa **Supabase CLI** para migraciones. Las migraciones de Drizzle (`src/shared/db/migrations/`) estan duplicadas en `supabase/migrations/` para compatibilidad con `supabase db push`.

```bash
# Una sola vez al clonar el repo
supabase link --project-ref wabddbkwugepkwrgzhpk
```

### Flujo diario
```bash
# Ver estado de migraciones
supabase migration list

# Aplicar migraciones pendientes al remote
supabase db push

# Si hay desincronizacion (migraciones aplicadas pero no trackeadas):
# 1. Identificar cuales faltan con `supabase migration list`
# 2. Reparar una por una:
supabase migration repair --status applied 20250101000013
# 3. Si la migracion no se aplico realmente (solo se reparo el historial),
#    ejecutar el SQL manualmente en Supabase SQL Editor
```

### Crear nueva migracion
```bash
supabase migration new nombre_descriptivo
# Editar supabase/migrations/<timestamp>_nombre_descriptivo.sql
supabase db push
```

### Nota importante
Si `supabase db push` falla porque la migracion ya existe en la DB pero no en el historial, usar `supabase migration repair --status applied <id>`. Esto solo actualiza la tabla de historial -- la migracion DEBE haberse ejecutado previamente o ejecutarse manualmente en SQL Editor.

### Schema Drizzle
Las definiciones de schema en `src/shared/db/schema/` son la fuente de verdad para Drizzle ORM. Las migraciones de Supabase deben mantenerse sincronizadas con estas definiciones.
