import { Elysia } from 'elysia';
import { verifyAccess } from '../../shared/lib/jwt';
import { safeCall } from '../../shared/lib/route-utils';
import { authGuard } from '../../shared/middleware/require-auth';
import { locationUpdateBody } from './schema';
import { getDriverIdByUserId, upsertLocation } from './service';

export const locationWsPlugin = new Elysia().ws('/ws/location', {
  async open(ws) {
    // Store a promise that resolves with the driverId once auth completes.
    // The message handler awaits this promise so it never races open().
    let resolveReady: (driverId: string | null) => void;
    (ws.data as any).ready = new Promise<string | null>((resolve) => {
      resolveReady = resolve;
    });

    const token = ws.data.query?.token;
    if (!token) {
      ws.close(4001, 'Unauthorized');
      resolveReady!(null);
      return;
    }

    const result = await verifyAccess(token);
    if (!result.ok) {
      ws.close(4001, 'Unauthorized');
      resolveReady!(null);
      return;
    }

    (ws.data as any).userId = result.payload.sub;

    const driverId = await getDriverIdByUserId(result.payload.sub).catch(() => null);
    if (!driverId) {
      ws.close(4001, 'No driver profile');
      resolveReady!(null);
      return;
    }

    (ws.data as any).driverId = driverId;
    resolveReady!(driverId);
  },
  async message(ws, message: any) {
    let data = message;
    if (typeof message === 'string') {
      try {
        data = JSON.parse(message);
      } catch {
        return;
      }
    }

    if (typeof data.lat !== 'number' || typeof data.lng !== 'number') return;

    // Use the cached driverId, or wait for the open handler to finish.
    let driverId = (ws.data as any).driverId as string | undefined;
    if (!driverId) {
      const ready = (ws.data as any).ready as Promise<string | null> | undefined;
      driverId = (ready ? await ready : null) ?? undefined;
      if (!driverId) return;
    }

    await upsertLocation(driverId, data.lat, data.lng, data.heading);
  },
  close(_ws) {
    // no cleanup needed for MVP
  },
});

export const locationHttpPlugin = new Elysia({ prefix: '/location' }).use(authGuard).post(
  '/update',
  ({ user, body, set }) => {
    return safeCall(async () => {
      const driverId = await getDriverIdByUserId(user.id);
      await upsertLocation(driverId, body.lat, body.lng, body.heading);
      return { message: 'Location updated' };
    }, set);
  },
  { body: locationUpdateBody, requireAuth: true },
);
