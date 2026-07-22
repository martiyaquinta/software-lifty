process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { drivers, tripEvents, trips, users } from '../../shared/db/schema';
import { createTestAuthPlugin, createTestToken } from '../../shared/testing/utils';

let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(tripEvents);
  await db.delete(trips);
  await db.delete(drivers);
  await db.delete(users);
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

async function registerAndGetToken(phone: string, _password: string): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
    .returning({ id: users.id });
  return createTestToken(user.id);
}

async function createDriverRow(token: string): Promise<string> {
  await request('PUT', '/api/drivers/me', { first_name: 'Test Driver' }, token);
  const db = getDb();
  const [driver] = await db.select({ id: drivers.id }).from(drivers).limit(1);
  return driver!.id;
}

beforeAll(() => {
  app = createApp(createTestAuthPlugin());
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Trip State Machine', () => {
  const phone = '+5492611111111';
  const password = 'testPass123';

  test('1. accept from request_received → accepted', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      {
        origin_lat: -31.9,
        origin_lng: -65.0,
        dest_lat: -31.88,
        dest_lng: -65.02,
        vehicle_type: 'car',
        distance_km: 5,
        duration_minutes: 15,
      },
      token,
    );

    expect(trip.status).toBe('request_received');
    expect(trip.id).toBeString();

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/accept`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('accepted');

    const db = getDb();
    const events = await db.select().from(tripEvents).where(eq(tripEvents.trip_id, trip.id));
    expect(events.length).toBe(2);
    expect(events[1].from_status).toBe('request_received');
    expect(events[1].to_status).toBe('accepted');
  });

  test('2. reject from request_received → rejected', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/reject`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('rejected');

    const db = getDb();
    const events = await db.select().from(tripEvents).where(eq(tripEvents.trip_id, trip.id));
    expect(events.length).toBe(2);
    expect(events[1].from_status).toBe('request_received');
    expect(events[1].to_status).toBe('rejected');
  });

  test('3. en-route from accepted → en_route', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/en-route`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('en_route');

    const db = getDb();
    const events = await db.select().from(tripEvents).where(eq(tripEvents.trip_id, trip.id));
    expect(events.length).toBe(3);
    expect(events[2].from_status).toBe('accepted');
    expect(events[2].to_status).toBe('en_route');
  });

  test('4. arrived from en_route → waiting (sets waiting_since)', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/arrived`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('waiting');
    expect(data.waiting_since).toBeString();

    const db = getDb();
    const [updated] = await db.select().from(trips).where(eq(trips.id, trip.id));
    expect(updated!.waiting_since).not.toBeNull();
  });

  test('5. start from waiting → in_trip', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);

    const { status, data } = await request('POST', `/api/trips/${trip.id}/start`, undefined, token);

    expect(status).toBe(200);
    expect(data.status).toBe('in_trip');

    const db = getDb();
    const events = await db.select().from(tripEvents).where(eq(tripEvents.trip_id, trip.id));
    expect(events.length).toBe(5);
    expect(events[4].from_status).toBe('waiting');
    expect(events[4].to_status).toBe('in_trip');
  });

  test('6. complete from in_trip → completed', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/start`, undefined, token);

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/complete`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('completed');

    const db = getDb();
    const events = await db.select().from(tripEvents).where(eq(tripEvents.trip_id, trip.id));
    expect(events.length).toBe(6);
    expect(events[5].from_status).toBe('in_trip');
    expect(events[5].to_status).toBe('completed');
  });

  test('7. cancel from waiting < 5min → cancelled_early', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);

    const db = getDb();
    await db.update(trips).set({ waiting_since: new Date() }).where(eq(trips.id, trip.id));

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/cancel`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('cancelled_early');
  });

  test('8. cancel from waiting >= 5min → cancelled_late', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);

    const db = getDb();
    await db
      .update(trips)
      .set({
        status: 'waiting',
        waiting_since: new Date(Date.now() - 10 * 60 * 1000),
        updated_at: new Date(),
      })
      .where(eq(trips.id, trip.id));

    const { status, data } = await request(
      'POST',
      `/api/trips/${trip.id}/cancel`,
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('cancelled_late');
  });

  test('9. GET /active returns active trip', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);

    const { status, data } = await request('GET', '/api/trips/active', undefined, token);

    expect(status).toBe(200);
    expect(data).not.toBeNull();
    expect(data.id).toBe(trip.id);
    expect(data.status).toBe('accepted');
  });

  test('10. GET /history returns paginated trips', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    for (let i = 0; i < 3; i++) {
      await request(
        'POST',
        '/api/trips',
        { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
        token,
      );
    }

    const { status, data } = await request(
      'GET',
      '/api/trips/history?page=1&limit=2',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    expect(data[0].origin_lat).toBe(-31.9);
  });

  test('11. GET /:id returns trip detail', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    const { status, data } = await request('GET', `/api/trips/${trip.id}`, undefined, token);

    expect(status).toBe(200);
    expect(data.id).toBe(trip.id);
    expect(data.origin_lat).toBe(-31.9);
    expect(data.dest_lat).toBe(-31.88);
  });

  test('12. invalid transition returns error', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);

    const { status, data } = await request('POST', `/api/trips/${trip.id}/start`, undefined, token);

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toContain('Invalid transition');
  });

  test('13. create trip with fare calculation', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { status, data } = await request(
      'POST',
      '/api/trips',
      {
        origin_lat: -31.9,
        origin_lng: -65.0,
        dest_lat: -31.88,
        dest_lng: -65.02,
        vehicle_type: 'car',
        distance_km: 5,
        duration_minutes: 10,
      },
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('request_received');
    expect(data.total_fare).toBeGreaterThan(0);
    expect(data.base_fare).toBeGreaterThan(0);
    expect(data.distance_fare).toBeGreaterThan(0);
    expect(data.time_fare).toBeGreaterThan(0);
    expect(data.platform_fee).toBeGreaterThan(0);
    expect(data.driver_earnings).toBeGreaterThan(0);
    expect(data.driver_earnings).toBeLessThan(data.total_fare);
  });

  test('14. collect cash trip sets is_collected and accumulates platform_debt', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/start`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/complete`, undefined, token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'cash' },
      token,
    );

    expect(status).toBe(200);
    expect(data.is_collected).toBe(true);
    expect(data.payment_method).toBe('cash');

    const db = getDb();
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.platform_debt).toBeGreaterThan(0);
  });

  test('15. collect mercadopago trip sets is_collected and does NOT accumulate platform_debt', async () => {
    const token = await registerAndGetToken(phone, password);
    const driverId = await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/start`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/complete`, undefined, token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'mercadopago' },
      token,
    );

    expect(status).toBe(200);
    expect(data.is_collected).toBe(true);
    expect(data.payment_method).toBe('mercadopago');

    const db = getDb();
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    expect(driver.platform_debt).toBe(0);
  });

  test('16. collect already collected trip returns error', async () => {
    const token = await registerAndGetToken(phone, password);
    await createDriverRow(token);

    const { data: trip } = await request(
      'POST',
      '/api/trips',
      { origin_lat: -31.9, origin_lng: -65.0, dest_lat: -31.88, dest_lng: -65.02, vehicle_type: 'car', distance_km: 5, duration_minutes: 15 },
      token,
    );

    await request('POST', `/api/trips/${trip.id}/accept`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/en-route`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/arrived`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/start`, undefined, token);
    await request('POST', `/api/trips/${trip.id}/complete`, undefined, token);

    await request('PUT', `/api/trips/${trip.id}/collect`, { payment_method: 'cash' }, token);

    const { status, data } = await request(
      'PUT',
      `/api/trips/${trip.id}/collect`,
      { payment_method: 'mercadopago' },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toContain('already collected');
  });
});
