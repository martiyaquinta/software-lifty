import { createHash } from 'node:crypto';
import { SignJWT, createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose';

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

// Modern Supabase projects sign access tokens with asymmetric keys (ES256/RS256)
// exposed via JWKS. Symmetric secret verification alone rejects those tokens, so
// we resolve the project's public keys here and cache the set for reuse.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getSupabaseJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  // Tests mint HS256 tokens locally; skip the network fetch entirely.
  if (process.env.NODE_ENV === 'test') return null;
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${url.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
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

type VerifyKey = Uint8Array | ReturnType<typeof createRemoteJWKSet>;

async function tryVerify(token: string, key: VerifyKey): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, key as Parameters<typeof jwtVerify>[1]);
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
  // 1. Supabase asymmetric tokens (ES256/RS256) via JWKS — the current default.
  const jwkSet = getSupabaseJwks();
  if (jwkSet) {
    const result = await tryVerify(token, jwkSet);
    if (result.ok) return result;
    // An expired signature is a definitive answer — don't retry other keys, or
    // we'd downgrade the reason to 'invalid' and break token-refresh handling.
    if (result.reason === 'expired') return result;
  }

  // 2. Legacy Supabase symmetric secret (HS256), for older/legacy tokens.
  const supabaseSecret = getSupabaseSecret();
  if (supabaseSecret) {
    const result = await tryVerify(token, supabaseSecret);
    if (result.ok) return result;
  }

  // 3. Backend-issued access tokens.
  return tryVerify(token, getBackendSecret());
}
