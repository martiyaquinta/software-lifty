import { errors as joseErrors, jwtVerify } from 'jose';

function getSecret(): Uint8Array {
  const s = process.env.SUPABASE_JWT_SECRET ?? process.env.JWT_SECRET;
  if (!s) throw new Error('SUPABASE_JWT_SECRET is required');
  return new TextEncoder().encode(s);
}

export interface TokenPayload {
  sub: string;
  role: string;
}

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: 'expired' | 'invalid' };

export async function verifyAccess(token: string): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
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
