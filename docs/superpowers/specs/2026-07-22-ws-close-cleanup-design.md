# WebSocket close cleanup (#91)

## Problem

`apps/backend/src/features/location/routes.ts:92-94` — the `close` handler is a no-op:

```ts
close(_ws) {
  // no cleanup needed for MVP
},
```

When a driver's WebSocket disconnects (crash, background, network loss), `drivers.is_online` stays `true` forever. The driver appears available indefinitely and could receive trip requests they'll never accept.

Additionally, `resolveUserIdFromToken` checked Supabase before the test-mode fallback, causing WebSocket auth to fail in test environments with `SUPABASE_URL` set.

## Fix

1. **`close` handler**: Extract `driverId` from `ws.data` (set during `open`). If present, update `drivers.is_online = false` and `drivers.updated_at = NOW()`.

2. **`resolveUserIdFromToken`**: Check `NODE_ENV === 'test'` first, before trying Supabase. In test mode, resolve token directly against the local DB.

3. **New `markDriverOffline` function** in `service.ts`.

No changes to `driver_locations`. No migrations.

## Files changed

- `apps/backend/src/features/location/routes.ts` — fix `close` handler + `resolveUserIdFromToken` ordering
- `apps/backend/src/features/location/service.ts` — add `markDriverOffline`
- `apps/backend/src/features/location/location.test.ts` — add test for WS close cleanup
