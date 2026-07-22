process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lifty:lifty@localhost:5433/lifty_test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../../index';
import { getDb, resetDb } from '../../shared/db/client';
import { districts, driverDocuments, drivers, users, vehicles } from '../../shared/db/schema';
import { DOC_TYPES } from '../../shared/lib/documents';
import { getRedis } from '../../shared/lib/redis';
import { extractStoragePath } from '../../shared/lib/storage';
import { createTestToken } from '../../shared/testing/utils';

let app: any;

async function truncateTables() {
  const db = getDb();
  await db.delete(driverDocuments);
  await db.delete(vehicles);
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

async function registerAndGetToken(phone: string, _password: string): Promise<{ token: string; userId: string }> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ phone, full_name: 'Juan Perez', role: 'driver' })
    .returning({ id: users.id });
  return { token: await createTestToken(user.id), userId: user.id };
}

async function fullOnboarding(phone: string, password: string) {
  const { token, userId } = await registerAndGetToken(phone, password);
  const { data: step1Res } = await request(
    'PUT',
    '/api/drivers/me',
    { first_name: 'Juan Perez' },
    token,
  );
  const driverId = step1Res.id;
  const db = getDb();
  await db.update(users).set({ kyc_status: 'approved' }).where(eq(users.id, userId));
  await db.update(drivers).set({ kyc_status: 'approved' }).where(eq(drivers.id, driverId));
  await request(
    'PUT',
    '/api/drivers/me',
    { vehicle_brand: 'Toyota', vehicle_model: 'Corolla', vehicle_year: 2022, vehicle_color: 'Blanco', vehicle_plate: 'ABC123' },
    token,
  );
  return { token, driverId, userId };
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateTables();
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys('ratelimit:public-profile:ip:*');
      if (keys.length > 0) await redis.del(...keys);
    } catch {
      /* best-effort */
    }
  }
});

afterAll(async () => {
  await truncateTables();
  resetDb();
});

describe('Driver Profile', () => {
  const phone = '+5492611111111';
  const password = 'testPass123';

  test('GET /:id/profile returns public profile', async () => {
    const { driverId } = await fullOnboarding(phone, password);

    const { status, data } = await request('GET', `/api/drivers/${driverId}/profile`);

    expect(status).toBe(200);
    expect(data.id).toBe(driverId);
    expect(data.full_name).toBe('Juan');
    expect(data.avatar_url).toBeNull();
    expect(data.rating_avg).toBe(0);
    expect(data.total_trips).toBe(0);
    expect(data.kyc_verified).toBe(true);
    expect(data.vehicle.brand).toBe('Toyota');
    expect(data.vehicle.model).toBe('Corolla');
    expect(data.vehicle.year).toBe(2022);
    expect(data.vehicle.color).toBe('Blanco');
  });

  test('GET /:id/profile for non-existent driver returns 422', async () => {
    const { status, data } = await request(
      'GET',
      '/api/drivers/00000000-0000-0000-0000-000000000000/profile',
    );

    expect(status).toBe(404);
    expect(data.error.code).toBe('NOT_FOUND');
    expect(data.error.message).toBe('Driver not found');
  });

  test('GET /:id/profile without auth works (public endpoint)', async () => {
    const { driverId } = await fullOnboarding(phone, password);

    const { status, data } = await request('GET', `/api/drivers/${driverId}/profile`);

    expect(status).toBe(200);
    expect(data.id).toBe(driverId);
  });

  test('GET /me returns full profile', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);

    const { status, data } = await request('GET', '/api/drivers/me', undefined, token);

    expect(status).toBe(200);
    expect(data.id).toBe(driverId);
    expect(data.user_id).toBeString();
    expect(data.phone).toBe(phone);
    expect(data.email).toBeNull();
    expect(data.full_name).toBe('Juan Perez');
    expect(data.avatar_url).toBeNull();
    expect(data.status).toBe('documents');
    expect(data.kyc_status).toBe('approved');
    expect(data.rating_avg).toBe(0);
    expect(data.total_trips).toBe(0);
    expect(data.completion_rate).toBe(0);
    expect(data.is_online).toBe(false);
    expect(data.vehicle.brand).toBe('Toyota');
    expect(data.vehicle.model).toBe('Corolla');
    expect(data.vehicle.year).toBe(2022);
    expect(data.vehicle.color).toBe('Blanco');
    expect(data.vehicle.plate).toBe('ABC123');
    expect(data.vehicle.vehicle_type).toBe('car');
    expect(data.created_at).toBeString();
  });

  test('GET /me without auth returns 401', async () => {
    const { status, data } = await request('GET', '/api/drivers/me');

    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('GET /me without driver row returns onboarding status', async () => {
    const { token } = await registerAndGetToken(phone, password);

    const { status, data } = await request('GET', '/api/drivers/me', undefined, token);

    expect(status).toBe(200);
    expect(data.step).toBe('step1');
    expect(data.message).toBe('Onboarding not started');
  });

  test('GET /:id/profile includes kyc_verified badge', async () => {
    const { driverId, userId } = await fullOnboarding(phone, password);

    const db = getDb();
    await db.update(users).set({ kyc_status: 'approved' }).where(eq(users.id, userId));
    await db.update(drivers).set({ kyc_status: 'approved' }).where(eq(drivers.id, driverId));

    const { status, data } = await request('GET', `/api/drivers/${driverId}/profile`);

    expect(status).toBe(200);
    expect(data.kyc_verified).toBe(true);
  });

  test('PUT /me/online toggles status', async () => {
    const { token, userId } = await registerAndGetToken(phone, password);
    await request('PUT', '/api/drivers/me', { first_name: 'Test' }, token);
    const db = getDb();
    const [district] = await db
      .select({ id: districts.id })
      .from(districts)
      .orderBy(districts.name)
      .limit(1);
    await db
      .update(drivers)
      .set({ status: 'approved', district_id: district.id })
      .where(eq(drivers.user_id, userId));

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );
    expect(status).toBe(200);
    expect(data.is_online).toBe(true);
    expect(data.message).toContain('online');

    const { status: s2, data: d2 } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: false },
      token,
    );
    expect(s2).toBe(200);
    expect(d2.is_online).toBe(false);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    const [driver] = await db
      .select({ is_online: drivers.is_online })
      .from(drivers)
      .where(eq(drivers.user_id, user!.id))
      .limit(1);
    expect(driver.is_online).toBe(false);
  });

  test('PUT /me/online without auth returns 401', async () => {
    const { status, data } = await request('PUT', '/api/drivers/me/online', { is_online: true });
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('PUT /me/online without driver row returns error', async () => {
    const { token } = await registerAndGetToken(phone, password);
    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );
    expect(status).toBe(404);
    expect(data.error.message).toContain('Onboarding');
  });

  test('PUT /me/heartbeat updates last_heartbeat and driver_locations.updated_at', async () => {
    const { token, driverId, userId } = await fullOnboarding(phone, password);
    const db = getDb();

    await db
      .update(drivers)
      .set({ status: 'approved', is_online: true })
      .where(eq(drivers.id, driverId));

    const beforeDriver = await db
      .select({ last_heartbeat: drivers.last_heartbeat })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(beforeDriver[0]?.last_heartbeat).toBeNull();

    const { status } = await request('PUT', '/api/drivers/me/heartbeat', undefined, token);

    expect(status).toBe(200);

    const [afterDriver] = await db
      .select({ last_heartbeat: drivers.last_heartbeat })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    expect(afterDriver.last_heartbeat).not.toBeNull();
    expect(afterDriver.last_heartbeat!.getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  test('PUT /me/heartbeat without auth returns 401', async () => {
    const { status, data } = await request('PUT', '/api/drivers/me/heartbeat');
    expect(status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('PUT /me/heartbeat without driver row returns error', async () => {
    const { token } = await registerAndGetToken(phone, password);
    const { status, data } = await request('PUT', '/api/drivers/me/heartbeat', undefined, token);
    expect(status).toBe(404);
    expect(data.error.message).toContain('Onboarding');
  });

  test('GET /me includes vehicle data', async () => {
    const { token } = await fullOnboarding(phone, password);

    const { status, data } = await request('GET', '/api/drivers/me', undefined, token);

    expect(status).toBe(200);
    expect(data.vehicle.brand).toBe('Toyota');
    expect(data.vehicle.model).toBe('Corolla');
    expect(data.vehicle.year).toBe(2022);
    expect(data.vehicle.color).toBe('Blanco');
    expect(data.vehicle.plate).toBe('ABC123');
    expect(data.vehicle.vehicle_type).toBe('car');
  });

  test('GET /:id/profile enforces strict public rate limit', async () => {
    const { driverId } = await fullOnboarding(phone, password);
    const ip = '203.0.113.7';

    const call = async () => {
      const req = new Request(`http://localhost/api/drivers/${driverId}/profile`, {
        method: 'GET',
        headers: { 'x-forwarded-for': ip },
      });
      return app.handle(req);
    };

    for (let i = 0; i < 11; i++) {
      const res = await call();
      if (i < 10) {
        expect(res.status).toBe(200);
      } else {
        expect(res.status).toBe(429);
      }
    }
  });

  test('/me routes are NOT throttled by the public profile rate limiter', async () => {
    const { driverId, token } = await fullOnboarding(phone, password);
    const ip = '203.0.113.99';

    const publicCall = async () => {
      const req = new Request(`http://localhost/api/drivers/${driverId}/profile`, {
        method: 'GET',
        headers: { 'x-forwarded-for': ip },
      });
      return app.handle(req);
    };

    const authCall = async () => {
      const req = new Request('http://localhost/api/drivers/me', {
        method: 'GET',
        headers: { 'x-forwarded-for': ip, Authorization: `Bearer ${token}` },
      });
      return app.handle(req);
    };

    for (let i = 0; i < 10; i++) {
      const res = await publicCall();
      expect(res.status).toBe(200);
    }

    const publicRes = await publicCall();
    expect(publicRes.status).toBe(429);

    const authRes = await authCall();
    expect(authRes.status).toBe(200);
  });
});

async function reupload(token: string, docType: string) {
  const formData = new FormData();
  formData.append('file', new Blob(['content'], { type: 'image/png' }), `${docType}.png`);
  formData.append('doc_type', docType);
  const req = new Request('http://localhost/api/drivers/me/documents/reupload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const res = await app.handle(req);
  return { status: res.status, data: await res.json() };
}

describe('Document re-upload', () => {
  const phone = '+5492617777777';
  const password = 'testPass123';

  test('re-uploading a sensitive doc pauses online and flags review', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const db = getDb();
    await db.update(drivers).set({ is_online: true, status: 'approved' }).where(eq(drivers.id, driverId));

    const { status, data } = await reupload(token, 'license_front');
    expect(status).toBe(200);
    expect(data.status).toBe('pending_review');
    expect(data.requires_review).toBe(true);

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    expect(driver!.documents_pending_review).toBe(true);
    expect(driver!.is_online).toBe(false);
    expect(driver!.status).toBe('review');
    expect(driver!.admin_review_status).toBe('pending');
  });

  test('cannot go online while documents pending review', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await reupload(token, 'license_front');

    const { status, data } = await request(
      'PUT',
      '/api/drivers/me/online',
      { is_online: true },
      token,
    );
    expect(status).toBe(409);
    expect(data.error.code).toBe('DOCUMENTS_UNDER_REVIEW');
  });

  test('re-upload supersedes previous doc of same type', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const db = getDb();
    await db
      .insert(driverDocuments)
      .values({ driver_id: driverId, doc_type: 'license_front', file_url: 'https://x.com/old.png', status: 'approved' });

    await reupload(token, 'license_front');

    const all = await db.select().from(driverDocuments).where(eq(driverDocuments.driver_id, driverId));
    const superseded = all.filter((d) => d.status === 'superseded');
    const pending = all.filter((d) => d.status === 'pending_review');
    expect(superseded.length).toBe(1);
    expect(pending.length).toBe(1);

    const { data: listed } = await request('GET', '/api/drivers/me/documents', undefined, token);
    expect(listed.every((d: { status: string }) => d.status !== 'superseded')).toBe(true);
  });

  test('admin approval clears pending flag and approves docs', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await reupload(token, 'license_front');

    const db = getDb();
    const [admin] = await db
      .insert(users)
      .values({ phone: '+5492610000001', role: 'admin' })
      .returning({ id: users.id });
    const adminToken = await createTestToken(admin.id);

    const { status } = await request(
      'POST',
      `/api/admin/drivers/${driverId}/review`,
      { action: 'approve' },
      adminToken,
    );
    expect(status).toBe(200);

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    expect(driver!.documents_pending_review).toBe(false);

    const docs = await db.select().from(driverDocuments).where(eq(driverDocuments.driver_id, driverId));
    expect(docs.some((d) => d.status === 'approved' && d.verified_at !== null)).toBe(true);
  });

  test('background_check re-upload also requires review', async () => {
    const { token } = await fullOnboarding(phone, password);
    const { status, data } = await reupload(token, 'background_check_front');
    expect(status).toBe(200);
    expect(data.requires_review).toBe(true);
  });
});

describe('Document step completeness', () => {
  const phone = '+5492619999999';
  const password = 'testPass123';

  test('status stays in documents step until all 8 doc types uploaded', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    const seven = [
      'license_front',
      'license_back',
      'registration_front',
      'registration_back',
      'insurance_front',
      'insurance_back',
      'background_check_front',
    ];
    await getDb().insert(driverDocuments).values(
      seven.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
      })),
    );

    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const data = await res.json();
    expect(data.step).toBe('documents');
  });

  test('duplicate doc types do not complete the documents step', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await getDb().insert(driverDocuments).values(
      Array.from({ length: 8 }, () => ({
        driver_id: driverId,
        doc_type: 'license_front',
        file_url: 'https://x.com/f.png',
      })),
    );

    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const data = await res.json();
    expect(data.step).toBe('documents');
  });

  test('all 8 distinct doc types move driver to review', async () => {
    const { token, driverId } = await fullOnboarding(phone, password);
    await getDb().insert(driverDocuments).values(
      DOC_TYPES.map((doc_type) => ({
        driver_id: driverId,
        doc_type,
        file_url: 'https://x.com/f.png',
      })),
    );

    const res = await app.handle(
      new Request('http://localhost/api/drivers/me/status', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const data = await res.json();
    expect(data.step).toBe('review');
  });
});

describe('Avatar photo upload', () => {
  const phone = '+5492618888888';
  const password = 'testPass123';

  async function uploadPhoto(token: string) {
    const formData = new FormData();
    formData.append('file', new Blob(['image-data'], { type: 'image/png' }), 'avatar.png');
    const req = new Request('http://localhost/api/drivers/me/photo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const res = await app.handle(req);
    return { status: res.status, data: await res.json() };
  }

  test('POST /me/photo uploads avatar and sets avatar_url', async () => {
    const { token } = await registerAndGetToken(phone, password);

    const { status, data } = await uploadPhoto(token);

    expect(status).toBe(200);
    expect(data.file_url).toBeString();
    expect(data.file_url).toContain('avatars/');

    const { data: profile } = await request('GET', '/api/drivers/me', undefined, token);
    expect(profile.avatar_url).toBe(data.file_url);
  });

  test('POST /me/photo replaces old avatar_url on re-upload', async () => {
    const { token } = await registerAndGetToken(phone, password);

    const { data: first } = await uploadPhoto(token);
    const { data: second } = await uploadPhoto(token);

    expect(second.file_url).not.toBe(first.file_url);

    const { data: profile } = await request('GET', '/api/drivers/me', undefined, token);
    expect(profile.avatar_url).toBe(second.file_url);
  });

  test('POST /me/photo without auth returns 401', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['data'], { type: 'image/png' }), 'avatar.png');
    const req = new Request('http://localhost/api/drivers/me/photo', {
      method: 'POST',
      body: formData,
    });
    const res = await app.handle(req);
    expect(res.status).toBe(401);
  });
});

describe('extractStoragePath', () => {
  test('extracts path from public URL', () => {
    const path = extractStoragePath(
      'https://abc.supabase.co/storage/v1/object/public/driver-documents/avatars/user123-4567890',
    );
    expect(path).toBe('avatars/user123-4567890');
  });

  test('extracts path from mock URL', () => {
    const path = extractStoragePath('mock://storage.lifty/avatars/user123-4567890');
    expect(path).toBe('avatars/user123-4567890');
  });

  test('returns null for null input', () => {
    expect(extractStoragePath(null)).toBeNull();
  });

  test('returns null for unrecognized URL format', () => {
    expect(extractStoragePath('https://example.com/photo.jpg')).toBeNull();
  });
});
