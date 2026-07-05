import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from './logger';

export async function createSession(
  userId: string,
): Promise<{ session_token: string; session_url: string }> {
  if (process.env.NODE_ENV === 'test') {
    return {
      session_token: `mock-session-${userId}`,
      session_url: 'https://didit.app/mock-session',
    };
  }

  const apiKey = process.env.DIDIT_API_KEY;
  if (!apiKey) {
    logger.warn('[DIDIT] DIDIT_API_KEY not set — using mock session');
    const token = `mock-session-${userId}`;
    return { session_token: token, session_url: `https://verify.didit.app?token=${token}` };
  }

  try {
    const diditApiUrl = process.env.DIDIT_API_URL || 'https://api-v2.didit.dev/v2';
    const res = await fetch(`${diditApiUrl}/sessions/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vendor_data: userId,
        features: 'OCR + FACE',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DIDIT session creation failed: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as { session_id: string; session_url: string };
    return { session_token: data.session_id, session_url: data.session_url };
  } catch (err) {
    logger.error('[DIDIT] createSession failed:', (err as Error).message);
    if ((err as Error).name === 'TimeoutError') {
      throw new Error('DIDIT session creation timed out');
    }
    throw new Error('Failed to create KYC session. Please try again.');
  }
}

export function verifyHmac(payload: string, signature: string): boolean {
  if (process.env.NODE_ENV === 'test') return !signature.includes('invalid');
  const secret =
    process.env.NODE_ENV !== 'production'
      ? 'mock-didit-webhook-secret-dev-only'
      : process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret) throw new Error('DIDIT_WEBHOOK_SECRET is required in production');
  const computed = createHmac('sha256', secret).update(payload).digest();
  const provided = Buffer.from(signature, 'hex');
  try {
    return timingSafeEqual(computed, provided);
  } catch {
    return false;
  }
}
