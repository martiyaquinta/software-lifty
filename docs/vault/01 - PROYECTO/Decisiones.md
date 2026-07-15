# Decisiones de Arquitectura

## Stack

| Decisión | Elección | Razón |
|----------|----------|-------|
| Runtime | Bun | TypeScript nativo, WebSocket integrado |
| Framework Backend | Elysia JS | Type-safe, ergonomía Fastify-like |
| Arquitectura | Feature-oriented | Cada feature = routes + service + handler + schema + tests |
| ORM | Drizzle ORM | Declarativo, type-safe, SQL-like |
| Auth | Supabase Auth SDK | Verificación via `supabase.auth.getUser()`, sin JWT propio |
| WebSocket | Elysia WS + `Bun.serve` | Ubicación en tiempo real, chat |
| Validación | TypeBox (nativo en Elysia) | Schemas compartibles con frontend |
| Pagos | Mercado Pago API | Webhook + split 80/20 + withdrawal a CVU |
| KYC | DIDIT (SDK en app) + Webhook en backend | HMAC verified |
| Maps | Google Maps via proxy | API keys no salen del server |
| Push | Firebase Cloud Messaging | Expo Notifications en frontend |
| Storage | Supabase Storage | Docs, selfies |
| Email | Resend | Transaccionales (verificación) |
| Cache / Rate Limit | Redis (ioredis) | Rate limiting + cache de ubicación |

## Pendientes / Tech Debt

1. **Backend test script**: `"test": "echo \"Error: no test specified\""` — arreglar
2. **Frontend test script**: Jest instalado pero sin script `test`
3. **Shared tsconfig**: `tsconfig.base.json` en root
