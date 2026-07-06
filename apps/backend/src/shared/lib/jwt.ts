import { createHash } from 'node:crypto';
import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';

function getBackendSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is required');
  return new TextEncoder().encode(s);
}

function getSupabaseSecret(): Uint8Array | null {
  const s = process.env.SUPABASE_JWT_SECRET;
  if (!s) return null;
  return new TextEncoder().encode(s);
}

export interface TokenPayload {
  sub: string;
  role: string;
}

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: 'expired' | 'invalid' };

export async function signAccess(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getBackendSecret());
}

export async function signRefresh(userId: string): Promise<string> {
  const token = crypto.randomUUID() + crypto.randomUUID();
  return token.replace(/-/g, '');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function tryVerify(token: string, secret: Uint8Array): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      ok: true,
      payload: { sub: payload.sub as string, role: (payload as any).role ?? 'driver' },
    };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: false, reason: 'invalid' };
  }
}

export async function verifyAccess(token: string): Promise<VerifyResult> {
  const supabaseSecret = getSupabaseSecret();
  if (supabaseSecret) {
    const result = await tryVerify(token, supabaseSecret);
    if (result.ok) return result;
  }
  return tryVerify(token, getBackendSecret());
}
