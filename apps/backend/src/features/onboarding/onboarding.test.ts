process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { driverDocuments, drivers, refreshTokens, users, vehicles } from '../../shared/db/schema';
import { createTestToken } from '../../shared/testing/utils';

let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(driverDocuments);
  await db.delete(vehicles);
  await db.delete(drivers);
  await db.delete(refreshTokens);
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
    .values({ phone, full_name: 'Test Driver', role: 'driver', password_hash: 'unused' })
    .returning({ id: users.id });
  return createTestToken(user.id, 'driver');
}

async function registerAndGetTokenAndUser(phone: string, _password: string): Promise<{ token: string; userId: string }> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Test Driver', role: 'driver', password_hash: 'unused' })
    .returning({ id: users.id });
  const token = await createTestToken(user.id, 'driver');
  return { token, userId: user.id };
}

async function approveKyc(userId: string) {
  const db = getDb();
  await db.update(users).set({ kyc_status: 'approved' }).where(eq(users.id, userId));
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

describe('Onboarding', () => {
  const phone = '+5492611111111';
  const password = 'testPass123';

  test('step1 creates driver profile and returns kyc session', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'POST',
      '/api/onboarding/step1',
      { full_name: 'Juan Perez' },
      token,
    );

    expect(status).toBe(200);
    expect(data.id).toBeString();
    expect(data.status).toBe('kyc_pending');
    expect(data.kyc_session).toBeDefined();
    expect(data.kyc_session.session_token).toContain('mock-session');
    expect(data.kyc_session.session_url).toBeString();

    const db = getDb();
    const [driver] = await db.select().from(drivers);
    expect(driver).toBeDefined();
    expect(driver!.status).toBe('kyc_pending');
  });

  test('step1 without auth returns 401', async () => {
    const { status, data } = await request('POST', '/api/onboarding/step1', {
      full_name: 'Juan Perez',
    });
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('step2 requires KYC approved', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await request('POST', '/api/onboarding/step1', { full_name: 'Juan Perez' }, token);

    await approveKyc(userId);

    const { status, data } = await request(
      'POST',
      '/api/onboarding/step2',
      { brand: 'Toyota', model: 'Corolla', year: 2020, color: 'Red', plate: 'ABC123' },
      token,
    );

    expect(status).toBe(200);
    expect(data.vehicle_id).toBeString();
    expect(data.status).toBe('documents');
    expect(data.message).toBe('Step 2 completed');

    const db = getDb();
    const allVehicles = await db.select().from(vehicles);
    expect(allVehicles.length).toBe(1);
    expect(allVehicles[0].brand).toBe('Toyota');

    const [driver] = await db.select().from(drivers);
    expect(driver!.status).toBe('documents');
  });

  test('step2 without KYC returns error', async () => {
    const token = await registerAndGetToken(phone, password);
    await request('POST', '/api/onboarding/step1', { full_name: 'Juan Perez' }, token);

    const { status, data } = await request(
      'POST',
      '/api/onboarding/step2',
      { brand: 'Toyota', model: 'Corolla', year: 2020, color: 'Red', plate: 'ABC123' },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('KYC_REQUIRED');
  });

  test('step2 without step1 returns error', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request(
      'POST',
      '/api/onboarding/step2',
      { brand: 'Toyota', model: 'Corolla', year: 2020, color: 'Red', plate: 'ABC123' },
      token,
    );

    expect(status).toBe(404);
    expect(data.error.code).toBe('NOT_FOUND');
  });

  test('step3 uploads documents', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await request('POST', '/api/onboarding/step1', { full_name: 'Juan Perez' }, token);
    await approveKyc(userId);
    await request(
      'POST',
      '/api/onboarding/step2',
      { brand: 'Toyota', model: 'Corolla', year: 2020, color: 'Red', plate: 'ABC123' },
      token,
    );

    const { status, data } = await request(
      'POST',
      '/api/onboarding/step3',
      {
        documents: [
          { doc_type: 'license_front', file_url: 'https://files.example.com/license.pdf' },
          { doc_type: 'insurance_front', file_url: 'https://files.example.com/insurance.pdf' },
        ],
      },
      token,
    );

    expect(status).toBe(200);
    expect(data.status).toBe('review');
    expect(data.message).toBe('Step 3 completed. Documents submitted for review.');
    expect(data.documents.length).toBe(2);
    expect(data.kyc_session).toBeUndefined();

    const db = getDb();
    const allDocs = await db.select().from(driverDocuments);
    expect(allDocs.length).toBe(2);

    const [driver] = await db.select().from(drivers);
    expect(driver!.status).toBe('review');
  });

  test('step3 requires KYC', async () => {
    const token = await registerAndGetToken(phone, password);
    await request('POST', '/api/onboarding/step1', { full_name: 'Juan Perez' }, token);

    const { status, data } = await request(
      'POST',
      '/api/onboarding/step3',
      {
        documents: [{ doc_type: 'license_front', file_url: 'https://files.example.com/license.pdf' }],
      },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('KYC_REQUIRED');
  });

  test('step3 with invalid doc_type returns error', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await request('POST', '/api/onboarding/step1', { full_name: 'Juan Perez' }, token);
    await approveKyc(userId);
    await request(
      'POST',
      '/api/onboarding/step2',
      { brand: 'Toyota', model: 'Corolla', year: 2020, color: 'Red', plate: 'ABC123' },
      token,
    );

    const { status, data } = await request(
      'POST',
      '/api/onboarding/step3',
      {
        documents: [{ doc_type: 'invalid_type', file_url: 'https://files.example.com/doc.pdf' }],
      },
      token,
    );

    expect(status).toBe(400);
    expect(data.error.code).toBe('BAD_REQUEST');
  });

  test('upload accepts new front/back doc types', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await request('POST', '/api/onboarding/step1', { full_name: 'Test' }, token);
    await approveKyc(userId);
    await request(
      'POST',
      '/api/onboarding/step2',
      { brand: 'Toyota', model: 'Corolla', year: 2022, color: 'Blanco', plate: 'ABC123' },
      token,
    );

    const fileContent = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', fileContent, 'license-front.png');
    formData.append('doc_type', 'license_front');

    const res = await app.handle(
      new Request('http://localhost/api/onboarding/step3/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.doc_type).toBe('license_front');
  });

  test('upload rejects legacy doc types', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await request('POST', '/api/onboarding/step1', { full_name: 'Test' }, token);
    await approveKyc(userId);
    await request(
      'POST',
      '/api/onboarding/step2',
      { brand: 'Toyota', model: 'Corolla', year: 2022, color: 'Blanco', plate: 'ABC123' },
      token,
    );

    const fileContent = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', fileContent, 'license.png');
    formData.append('doc_type', 'license');

    const res = await app.handle(
      new Request('http://localhost/api/onboarding/step3/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }),
    );
    expect(res.status).toBe(400);
  });

  test('status returns current step and info', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await request('POST', '/api/onboarding/step1', { full_name: 'Juan Perez' }, token);
    await approveKyc(userId);
    await request(
      'POST',
      '/api/onboarding/step2',
      { brand: 'Toyota', model: 'Corolla', year: 2020, color: 'Red', plate: 'ABC123' },
      token,
    );

    const { status, data } = await request('GET', '/api/onboarding/status', undefined, token);

    expect(status).toBe(200);
    expect(data.step).toBe('documents');
    expect(data.driver_status).toBe('documents');
    expect(data.kyc_status).toBe('approved');
    expect(data.has_vehicle).toBe(true);
    expect(data.documents_submitted).toBe(0);
  });

  test('step3/upload uploads a document', async () => {
    const { token, userId } = await registerAndGetTokenAndUser(phone, password);
    await request('POST', '/api/onboarding/step1', { full_name: 'Test' }, token);
    await approveKyc(userId);
    await request(
      'POST',
      '/api/onboarding/step2',
      { brand: 'Toyota', model: 'Corolla', year: 2022, color: 'Blanco', plate: 'ABC123' },
      token,
    );

    const fileContent = new Blob(['test content'], { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', fileContent, 'license.png');
    formData.append('doc_type', 'license_front');

    const req = new Request('http://localhost/api/onboarding/step3/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const res = await app.handle(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.file_url).toBeDefined();
    expect(data.doc_type).toBe('license_front');
    expect(data.kyc_session).toBeUndefined();
  });

  test('step3/upload without auth returns 401', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['x']), 'test.png');
    formData.append('doc_type', 'license_front');
    const req = new Request('http://localhost/api/onboarding/step3/upload', {
      method: 'POST',
      body: formData,
    });
    const res = await app.handle(req);
    expect(res.status).toBe(401);
  });

  test('status for user with no driver row returns step1', async () => {
    const token = await registerAndGetToken(phone, password);

    const { status, data } = await request('GET', '/api/onboarding/status', undefined, token);

    expect(status).toBe(200);
    expect(data.step).toBe('step1');
    expect(data.driver_status).toBeNull();
    expect(data.has_vehicle).toBe(false);
    expect(data.documents_submitted).toBe(0);
  });
});
