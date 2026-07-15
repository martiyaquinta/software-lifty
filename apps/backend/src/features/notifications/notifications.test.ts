process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { pushTokens, users } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';
let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(pushTokens);
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

async function registerUser(): Promise<string> {
  const phone = '+5492618888888';
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver' })
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

describe('Notifications', () => {
  test('POST /token registers push token', async () => {
    const accessToken = await registerUser();

    const { status, data } = await request(
      'POST',
      '/api/notifications/token',
      { token: 'expo-push-token-abc123', platform: 'ios' },
      accessToken,
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Token registered');

    const db = getDb();
    const [entry] = await db.select().from(pushTokens).limit(1);
    expect(entry).toBeDefined();
    expect(entry.token).toBe('expo-push-token-abc123');
    expect(entry.platform).toBe('ios');
  });

  test('POST /token without auth returns 401', async () => {
    const { status, data } = await request('POST', '/api/notifications/token', {
      token: 'expo-push-token-abc123',
    });

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('POST /token updates existing token', async () => {
    const accessToken = await registerUser();

    await request(
      'POST',
      '/api/notifications/token',
      { token: 'expo-old-token', platform: 'android' },
      accessToken,
    );

    const { status, data } = await request(
      'POST',
      '/api/notifications/token',
      { token: 'expo-new-token', platform: 'ios' },
      accessToken,
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Token registered');

    const db = getDb();
    const [entry] = await db.select().from(pushTokens).limit(1);
    expect(entry).toBeDefined();
    expect(entry.token).toBe('expo-new-token');
    expect(entry.platform).toBe('ios');
  });

  test('DELETE /token removes token', async () => {
    const accessToken = await registerUser();

    await request(
      'POST',
      '/api/notifications/token',
      { token: 'expo-push-token-abc123' },
      accessToken,
    );

    const { status, data } = await request(
      'DELETE',
      '/api/notifications/token',
      undefined,
      accessToken,
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Token removed');

    const db = getDb();
    const entries = await db.select().from(pushTokens);
    expect(entries).toHaveLength(0);
  });

  test('DELETE /token without auth returns 401', async () => {
    const { status, data } = await request('DELETE', '/api/notifications/token');

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('DELETE /token when no token exists returns success', async () => {
    const accessToken = await registerUser();

    const { status, data } = await request(
      'DELETE',
      '/api/notifications/token',
      undefined,
      accessToken,
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Token removed');
  });
});
