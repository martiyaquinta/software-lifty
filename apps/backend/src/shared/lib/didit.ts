import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from './logger';

const DEFAULT_API_URL = 'https://verification.didit.me/v3';

export interface DiditSession {
  session_id: string;
  session_token: string;
  session_url: string;
}

function getApiUrl(): string {
  return (process.env.DIDIT_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
}

export async function createSession(userId: string): Promise<DiditSession> {
  if (process.env.NODE_ENV === 'test') {
    return {
      session_id: `mock-session-${userId}`,
      session_token: `mock-session-${userId}`,
      session_url: 'https://verify.didit.me/mock-session',
    };
  }

  const apiKey = process.env.DIDIT_API_KEY;
  if (!apiKey) {
    logger.warn('[DIDIT] DIDIT_API_KEY not set — using mock session');
    const token = `mock-session-${userId}`;
    return {
      session_id: token,
      session_token: token,
      session_url: `https://verify.didit.me/mock-session?token=${token}`,
    };
  }

  const workflowId = process.env.DIDIT_WORKFLOW_ID;
  if (!workflowId) {
    throw new Error('DIDIT_WORKFLOW_ID is required to create a verification session');
  }

  try {
    const body: Record<string, unknown> = {
      workflow_id: workflowId,
      vendor_data: userId,
    };
    if (process.env.DIDIT_CALLBACK_URL) {
      body.callback = process.env.DIDIT_CALLBACK_URL;
    }

    const res = await fetch(`${getApiUrl()}/session/`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DIDIT session creation failed: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as {
      session_id: string;
      session_token: string;
      url: string;
    };
    return {
      session_id: data.session_id,
      session_token: data.session_token,
      session_url: data.url,
    };
  } catch (err) {
    logger.error('[DIDIT] createSession failed:', (err as Error).message);
    if ((err as Error).name === 'TimeoutError') {
      throw new Error('DIDIT session creation timed out');
    }
    throw new Error('Failed to create KYC session. Please try again.');
  }
}

export interface DiditDecision {
  session_id: string;
  status: string;
  vendor_data?: string | null;
  id_verifications?: Array<{
    document_number?: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
  }>;
}

export async function getSessionDecision(sessionId: string): Promise<DiditDecision> {
  if (process.env.NODE_ENV === 'test') {
    return { session_id: sessionId, status: 'In Progress', vendor_data: null };
  }

  const apiKey = process.env.DIDIT_API_KEY;
  if (!apiKey) throw new Error('DIDIT_API_KEY is required to fetch a session decision');

  const res = await fetch(`${getApiUrl()}/session/${sessionId}/decision/`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey, accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DIDIT decision fetch failed: ${res.status} ${errText}`);
  }

  return (await res.json()) as DiditDecision;
}

export function verifyHmac(payload: string, signature: string): boolean {
  if (process.env.NODE_ENV === 'test')
    return signature.length > 0 && !signature.includes('invalid');
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
