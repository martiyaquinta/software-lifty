process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { users } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

let app: any;

async function truncateTables() {
  const db = getDb();
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
    .values({ phone, full_name: 'Test User', role: 'driver' })
    .returning({ id: users.id });
  return createTestToken(user.id);
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateTables();
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Maps Proxy', () => {
  const phone = '+5492612222222';
  const password = 'testPass123';

  test('autocomplete returns places', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/places/autocomplete?input=Avellaneda',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].description).toContain('Avellaneda');
    expect(data[0].place_id).toBeString();
  });

  test('autocomplete without auth returns 401', async () => {
    const { status, data } = await request('GET', '/api/maps/places/autocomplete?input=Avellaneda');

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('geocode with coords returns address', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/geocode?lat=-34.6037&lng=-58.3816',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.lat).toBe(-34.6037);
    expect(data.lng).toBe(-58.3816);
    expect(data.formatted_address).toBeString();
    expect(data.formatted_address).toContain('Argentina');
  });

  test('geocode with address returns coords', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/geocode?address=Buenos%20Aires',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.lat).toBeNumber();
    expect(data.lng).toBeNumber();
    expect(data.formatted_address).toContain('Buenos Aires');
  });

  test('directions returns route', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'GET',
      '/api/maps/directions?origin_lat=-34.6037&origin_lng=-58.3816&dest_lat=-34.6158&dest_lng=-58.4333',
      undefined,
      token,
    );

    expect(status).toBe(200);
    expect(data.distance_km).toBeNumber();
    expect(data.distance_km).toBeGreaterThan(0);
    expect(data.duration_minutes).toBeNumber();
    expect(data.polyline).toBeString();
  });

  test('fare-estimate calculates fare', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'POST',
      '/api/maps/fare-estimate',
      {
        origin_lat: -34.6037,
        origin_lng: -58.3816,
        dest_lat: -34.6158,
        dest_lng: -58.4333,
        vehicle_type: 'car',
      },
      token,
    );

    expect(status).toBe(200);
    expect(data.distance_km).toBeNumber();
    expect(data.duration_minutes).toBeNumber();
    expect(data.base_fare).toBeGreaterThan(0);
    expect(data.distance_fare).toBeGreaterThan(0);
    expect(data.time_fare).toBeGreaterThan(0);
    expect(data.total).toBeGreaterThan(0);
    expect(data.platform_fee).toBeGreaterThan(0);
    expect(data.driver_earnings).toBeGreaterThan(0);
  });

  test('fare-estimate with invalid vehicle_type returns error', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'POST',
      '/api/maps/fare-estimate',
      {
        origin_lat: -34.6037,
        origin_lng: -58.3816,
        dest_lat: -34.6158,
        dest_lng: -58.4333,
        vehicle_type: 'helicopter',
      },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toContain('Invalid vehicle type');
  });

  test('fare-estimate without auth returns 401', async () => {
    const { status, data } = await request('POST', '/api/maps/fare-estimate', {
      origin_lat: -34.6037,
      origin_lng: -58.3816,
      dest_lat: -34.6158,
      dest_lng: -58.4333,
      vehicle_type: 'car',
    });

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
});
