import { eq } from 'drizzle-orm';
import * as jose from 'jose';
import { logger } from './logger';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

function parseServiceAccount(): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
} | null {
  try {
    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    const sa = JSON.parse(raw);
    return {
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    };
  } catch {
    return null;
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const sa = parseServiceAccount();
  if (!sa) return null;

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new jose.SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.clientEmail)
    .setSubject(sa.clientEmail)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await jose.importPKCS8(sa.privateKey, 'RS256'));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    logger.error('[FCM] Failed to get access token:', res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.token;
}

export async function sendPush(token: string, message: PushMessage): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') {
    logger.info('[PUSH]', token, message.title, '-', message.body);
    return true;
  }

  const sa = parseServiceAccount();
  if (!sa) {
    logger.warn('[PUSH] FCM not configured');
    return false;
  }

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return false;

    const payload: Record<string, unknown> = {
      message: {
        token,
        notification: { title: message.title, body: message.body },
      },
    };
    if (message.data) {
      (payload.message as any).data = message.data;
    }

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const err = (await res.json()) as any;
      if (err?.error?.details?.[0]?.errorCode === 'UNREGISTERED') {
        logger.warn('[FCM] Token unregistered, removing from DB');
        return false;
      }
      logger.error('[FCM] Send failed:', res.status, JSON.stringify(err));
      return false;
    }

    logger.info('[FCM] Push sent:', message.title);
    return true;
  } catch (err) {
    logger.error('[FCM] Error:', (err as Error).message);
    return false;
  }
}

export async function sendPushToUser(userId: string, message: PushMessage): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') {
    logger.info('[PUSH]', userId, message.title, '-', message.body);
    return true;
  }

  try {
    const { db } = await import('../db/client');
    const { pushTokens } = await import('../db/schema/push-tokens');

    const tokens = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(eq(pushTokens.user_id, userId));

    if (tokens.length === 0) {
      logger.warn('[FCM] No push tokens for user:', userId);
      return false;
    }

    let anySuccess = false;
    for (const t of tokens) {
      const ok = await sendPush(t.token, message);
      if (ok) anySuccess = true;
    }
    return anySuccess;
  } catch (err) {
    logger.error('[FCM] sendPushToUser error:', (err as Error).message);
    return false;
  }
}
