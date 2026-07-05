process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { driverLocations, drivers, refreshTokens, users } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

let app: any;
let server: any;
let port: number;

async function truncateTables() {
  const d = getDb();
  await d.delete(driverLocations);
  await d.delete(drivers);
  await d.delete(refreshTokens);
  await d.delete(users);
}

async function request(method: string, path: string, body?: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await app.handle(req);
  const data = await res.json();
  return { status: res.status, data };
}

async function registerAndCreateDriver(phone: string, _password: string) {
  const db = getDb();
  const [userRow] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver', password_hash: 'unused' })
    .returning({ id: users.id });

  const [driver] = await db
    .insert(drivers)
    .values({ user_id: userRow.id, status: 'approved' })
    .returning({ id: drivers.id });

  return {
    token: await createTestToken(userRow.id, 'driver'),
    userId: userRow.id,
    driverId: driver.id,
  };
}

function wsConnect(port: number, token: string): Promise<{ ws: WebSocket; open: boolean }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/location?token=${token}`);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 15000);

    ws.onopen = () => {
      clearTimeout(timeout);
      resolve({ ws, open: true });
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve({ ws, open: false });
    };
  });
}

function wsExpectClose(port: number, token: string): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/location?token=${token}`);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket close timeout'));
    }, 10000);

    ws.onclose = (event) => {
      clearTimeout(timeout);
      resolve({ code: event.code, reason: event.reason });
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve({ code: 1006, reason: 'Connection error' });
    };
  });
}

async function wsSendAndWait(message: object, ws: WebSocket, driverId: string): Promise<void> {
  return new Promise((resolve) => {
    ws.send(JSON.stringify(message));
    const poll = async () => {
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const [loc] = await getDb()
          .select({ id: driverLocations.driver_id })
          .from(driverLocations)
          .where(eq(driverLocations.driver_id, driverId))
          .limit(1);
        if (loc) return resolve();
      }
      resolve();
    };
    poll();
  });
}

import { eq } from 'drizzle-orm';

beforeAll(() => {
  app = createApp();
  app.listen(0);
  port = (app.server as any)?.port;
  server = app;
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  if (server?.server) {
    server.server.stop();
    await new Promise((r) => setTimeout(r, 500));
  }
  resetDb();
});

describe('Location WebSocket', () => {
  const phone = '+5492611234567';
  const password = 'testPass123';

  test('WS connects with valid token', async () => {
    const { token } = await registerAndCreateDriver(phone, password);
    const { ws, open } = await wsConnect(port, token);
    expect(open).toBe(true);
    ws.close();
  });

  test('WS rejects connection with invalid token', async () => {
    const { code } = await wsExpectClose(port, 'invalid-token');
    expect([4001, 1006]).toContain(code);
  });

  test(
    'WS stores location on message',
    async () => {
      const { token, driverId } = await registerAndCreateDriver(phone, password);
      const { ws, open } = await wsConnect(port, token);
      expect(open).toBe(true);

      await wsSendAndWait({ lat: -32.89, lng: -68.84, heading: 180 }, ws, driverId);
      ws.close();
      await new Promise((r) => setTimeout(r, 200));

      const [loc] = await getDb()
        .select()
        .from(driverLocations)
        .where(eq(driverLocations.driver_id, driverId))
        .limit(1);

      expect(loc).toBeDefined();
      expect(loc.lat).toBeCloseTo(-32.89, 1);
      expect(loc.lng).toBeCloseTo(-68.84, 1);
      expect(loc.heading).toBe(180);
    },
    { timeout: 15000 },
  );

  test('POST /api/location/update stores location', async () => {
    const { token, driverId } = await registerAndCreateDriver(phone, password);

    const { status, data } = await request(
      'POST',
      '/api/location/update',
      { lat: -34.6, lng: -58.38, heading: 270 },
      token,
    );
    expect(status).toBe(200);
    expect(data.message).toBe('Location updated');

    const [loc] = await getDb()
      .select()
      .from(driverLocations)
      .where(eq(driverLocations.driver_id, driverId))
      .limit(1);

    expect(loc).toBeDefined();
    expect(loc.lat).toBeCloseTo(-34.6, 1);
    expect(loc.lng).toBeCloseTo(-58.38, 1);
    expect(loc.heading).toBe(270);
  });

  test('POST /api/location/update without auth returns 401', async () => {
    const { status, data } = await request('POST', '/api/location/update', {
      lat: 0,
      lng: 0,
    });
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test(
    'WS sends location and persists to DB',
    async () => {
      const { token, driverId } = await registerAndCreateDriver(phone, password);
      const { ws, open } = await wsConnect(port, token);
      expect(open).toBe(true);

      await wsSendAndWait({ lat: 40.71, lng: -74.0 }, ws, driverId);
      ws.close();
      await new Promise((r) => setTimeout(r, 200));

      const [loc] = await getDb()
        .select()
        .from(driverLocations)
        .where(eq(driverLocations.driver_id, driverId))
        .limit(1);

      expect(loc).toBeDefined();
      expect(loc.lat).toBeCloseTo(40.71, 1);
      expect(loc.lng).toBeCloseTo(-74.0, 1);
    },
    { timeout: 15000 },
  );

  test('WS without driver row closes connection', async () => {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ phone, full_name: 'Test Driver', role: 'driver', password_hash: 'unused' })
      .returning({ id: users.id });
    const token = await createTestToken(user.id, 'driver');

    const { code } = await wsExpectClose(port, token);
    expect([4001, 1006]).toContain(code);
  });
});
