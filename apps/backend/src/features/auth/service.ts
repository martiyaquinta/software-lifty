import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { refreshTokens, users } from '../../shared/db/schema';
import { sendEmail } from '../../shared/lib/email';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../shared/lib/errors';
import { hashToken, signAccess, signRefresh } from '../../shared/lib/jwt';
import { logger } from '../../shared/lib/logger';
import type { AuthUser } from '../../shared/middleware/auth';

const REFRESH_TOKEN_DAYS = 30;
const VERIFICATION_CODE_MINUTES = 60;
const RESET_CODE_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Outside production, print codes to the log so flows can be tested
// without a real inbox. Never enabled in production: codes are secrets.
function logCodeForDev(kind: string, email: string, code: string) {
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`[AUTH] (dev) ${kind} code`, { email, code });
  }
}

// Codes carry their issue time implicitly: expires_at - lifetime = issued_at.
function issuedLessThanCooldownAgo(expiresAt: Date | null, lifetimeMinutes: number): boolean {
  if (!expiresAt) return false;
  const issuedAt = expiresAt.getTime() - lifetimeMinutes * 60 * 1000;
  return Date.now() - issuedAt < RESEND_COOLDOWN_MS;
}

function codeEmailHtml(title: string, code: string, expiryText: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #0D2B45;">${title}</h2>
      <p style="color: #A8B1BA; font-size: 16px;">Tu codigo es:</p>
      <div style="background: #F1F4F6; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: bold; color: #0D2B45; letter-spacing: 8px;">${code}</span>
      </div>
      <p style="color: #A8B1BA; font-size: 14px;">${expiryText}</p>
    </div>
  `;
}

export const authService = {
  async register(rawEmail: string, password: string) {
    const email = normalizeEmail(rawEmail);
    logger.info('[AUTH] Register attempt', { email });
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length > 0) {
      logger.warn('[AUTH] Register failed — email already exists', { email });
      throw new ConflictError('Ya existe una cuenta con este email');
    }

    logger.info('[AUTH] Register — creating user');
    const passwordHash = await Bun.password.hash(password);
    const verificationCode = generateCode();
    const codeExpiresAt = new Date(Date.now() + VERIFICATION_CODE_MINUTES * 60 * 1000);

    const [user] = await db
      .insert(users)
      .values({
        email,
        password_hash: passwordHash,
        role: 'driver',
        verification_code: verificationCode,
        verification_code_expires_at: codeExpiresAt,
      })
      .returning({ id: users.id, email: users.email });

    logger.info('[AUTH] Register — user created', { userId: user.id.split('-')[0] });
    logCodeForDev('verification', email, verificationCode);

    const emailHtml = codeEmailHtml(
      'Bienvenido a Lifty',
      verificationCode,
      'Este codigo expira en 1 hora.',
    );

    const sent = await sendEmail(email, 'Verifica tu cuenta de Lifty', emailHtml);
    logger.info('[AUTH] Register — email sent', { email, sent });

    return {
      id: user.id,
      email: user.email,
      message: 'Cuenta creada. Revisa tu email para el codigo de verificacion.',
    };
  },

  async verifyEmail(rawEmail: string, code: string) {
    const email = normalizeEmail(rawEmail);
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        email_verified: users.email_verified,
        verification_code: users.verification_code,
        verification_code_expires_at: users.verification_code_expires_at,
        verification_attempts: users.verification_attempts,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      throw new NotFoundError('Usuario no encontrado');
    }

    if (user.email_verified) {
      return { message: 'El email ya fue verificado', alreadyVerified: true };
    }

    if (
      !user.verification_code ||
      !user.verification_code_expires_at ||
      user.verification_code_expires_at < new Date()
    ) {
      throw new BadRequestError('El codigo expiro. Solicita uno nuevo.');
    }

    if (user.verification_attempts >= MAX_CODE_ATTEMPTS) {
      throw new BadRequestError('Demasiados intentos. Solicita un nuevo codigo.');
    }

    if (user.verification_code !== code) {
      await db
        .update(users)
        .set({ verification_attempts: user.verification_attempts + 1 })
        .where(eq(users.id, user.id));
      throw new BadRequestError('Codigo de verificacion invalido');
    }

    await db
      .update(users)
      .set({
        email_verified: true,
        verification_code: null,
        verification_code_expires_at: null,
        verification_attempts: 0,
      })
      .where(eq(users.id, user.id));

    logger.info('[AUTH] Email verified', { userId: user.id.split('-')[0] });

    return { message: 'Email verificado correctamente' };
  },

  async resendCode(rawEmail: string) {
    const email = normalizeEmail(rawEmail);
    const genericResponse = {
      message: 'Si existe una cuenta pendiente de verificacion, enviamos un nuevo codigo.',
    };

    const [user] = await db
      .select({
        id: users.id,
        email_verified: users.email_verified,
        verification_code_expires_at: users.verification_code_expires_at,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || user.email_verified) {
      return genericResponse;
    }

    if (issuedLessThanCooldownAgo(user.verification_code_expires_at, VERIFICATION_CODE_MINUTES)) {
      throw new TooManyRequestsError('Espera un minuto antes de pedir otro codigo.');
    }

    const verificationCode = generateCode();
    await db
      .update(users)
      .set({
        verification_code: verificationCode,
        verification_code_expires_at: new Date(Date.now() + VERIFICATION_CODE_MINUTES * 60 * 1000),
        verification_attempts: 0,
      })
      .where(eq(users.id, user.id));

    const sent = await sendEmail(
      email,
      'Tu nuevo codigo de verificacion de Lifty',
      codeEmailHtml('Verifica tu cuenta', verificationCode, 'Este codigo expira en 1 hora.'),
    );
    logger.info('[AUTH] Verification code resent', { userId: user.id.split('-')[0], sent });
    logCodeForDev('verification', email, verificationCode);

    return genericResponse;
  },

  async forgotPassword(rawEmail: string) {
    const email = normalizeEmail(rawEmail);
    const genericResponse = {
      message:
        'Si existe una cuenta con ese email, enviamos un codigo para restablecer la contrasena.',
    };

    const [user] = await db
      .select({ id: users.id, reset_code_expires_at: users.reset_code_expires_at })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return genericResponse;
    }

    if (issuedLessThanCooldownAgo(user.reset_code_expires_at, RESET_CODE_MINUTES)) {
      throw new TooManyRequestsError('Espera un minuto antes de pedir otro codigo.');
    }

    const resetCode = generateCode();
    await db
      .update(users)
      .set({
        reset_code: resetCode,
        reset_code_expires_at: new Date(Date.now() + RESET_CODE_MINUTES * 60 * 1000),
        reset_attempts: 0,
      })
      .where(eq(users.id, user.id));

    const sent = await sendEmail(
      email,
      'Restablece tu contrasena de Lifty',
      codeEmailHtml('Restablece tu contrasena', resetCode, 'Este codigo expira en 15 minutos.'),
    );
    logger.info('[AUTH] Password reset code sent', { userId: user.id.split('-')[0], sent });
    logCodeForDev('reset', email, resetCode);

    return genericResponse;
  },

  async resetPassword(rawEmail: string, code: string, newPassword: string) {
    const email = normalizeEmail(rawEmail);
    const [user] = await db
      .select({
        id: users.id,
        reset_code: users.reset_code,
        reset_code_expires_at: users.reset_code_expires_at,
        reset_attempts: users.reset_attempts,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Same message for unknown email, expired code, or missing code:
    // this endpoint must not confirm whether an account exists.
    const invalidError = new BadRequestError('Codigo invalido o expirado. Solicita uno nuevo.');

    if (!user || !user.reset_code || !user.reset_code_expires_at) {
      throw invalidError;
    }

    if (user.reset_code_expires_at < new Date()) {
      throw invalidError;
    }

    if (user.reset_attempts >= MAX_CODE_ATTEMPTS) {
      throw new BadRequestError('Demasiados intentos. Solicita un nuevo codigo.');
    }

    if (user.reset_code !== code) {
      await db
        .update(users)
        .set({ reset_attempts: user.reset_attempts + 1 })
        .where(eq(users.id, user.id));
      throw invalidError;
    }

    const passwordHash = await Bun.password.hash(newPassword);
    await db
      .update(users)
      .set({
        password_hash: passwordHash,
        reset_code: null,
        reset_code_expires_at: null,
        reset_attempts: 0,
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id));

    // Changing the password invalidates every open session.
    await db.delete(refreshTokens).where(eq(refreshTokens.user_id, user.id));

    logger.info('[AUTH] Password reset', { userId: user.id.split('-')[0] });

    return { message: 'Contrasena actualizada. Ya puedes iniciar sesion.' };
  },

  async login(rawEmail: string, password: string) {
    const email = normalizeEmail(rawEmail);
    logger.info('[AUTH] Login attempt', { email });

    let user:
      | {
          id: string;
          email: string | null;
          password_hash: string;
          role: string;
          email_verified: boolean;
        }
      | undefined;
    try {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          password_hash: users.password_hash,
          role: users.role,
          email_verified: users.email_verified,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      user = rows[0] ?? null;
    } catch (dbErr) {
      logger.error('[AUTH] Login — DB error looking up user', {
        email,
        error: (dbErr as Error).message,
      });
      throw dbErr;
    }

    if (!user) {
      logger.warn('[AUTH] Login — user not found', { email });
      throw new UnauthorizedError('Email o contrasena incorrectos');
    }

    logger.info('[AUTH] Login — user found', {
      userId: user.id.split('-')[0],
      emailVerified: user.email_verified,
    });

    const valid = await Bun.password.verify(password, user.password_hash);
    if (!valid) {
      logger.warn('[AUTH] Login — invalid password', { userId: user.id.split('-')[0] });
      throw new UnauthorizedError('Email o contrasena incorrectos');
    }

    if (!user.email_verified) {
      logger.warn('[AUTH] Login — email not verified', { userId: user.id.split('-')[0] });
      throw new UnauthorizedError('Debes verificar tu email antes de iniciar sesion');
    }

    logger.info('[AUTH] Login — generating tokens', { userId: user.id.split('-')[0] });
    const accessToken = await signAccess({ sub: user.id, role: user.role });
    const refreshToken = await signRefresh(user.id);
    const refreshTokenHash = hashToken(refreshToken);

    await db.insert(refreshTokens).values({
      user_id: user.id,
      token_hash: refreshTokenHash,
      expires_at: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    });

    logger.info('[AUTH] Login — success', { userId: user.id.split('-')[0] });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  },

  async refreshToken(token: string) {
    const tokenHash = hashToken(token);

    const [stored] = await db
      .select({
        id: refreshTokens.id,
        user_id: refreshTokens.user_id,
        expires_at: refreshTokens.expires_at,
      })
      .from(refreshTokens)
      .where(eq(refreshTokens.token_hash, tokenHash))
      .limit(1);

    if (!stored) {
      throw new UnauthorizedError('Refresh token invalido');
    }

    if (stored.expires_at < new Date()) {
      await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));
      throw new UnauthorizedError('Refresh token expirado');
    }

    await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

    const [user] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, stored.user_id))
      .limit(1);

    if (!user) {
      throw new UnauthorizedError('Usuario no encontrado');
    }

    const accessToken = await signAccess({ sub: user.id, role: user.role });
    const newRefreshToken = await signRefresh(user.id);
    const newRefreshTokenHash = hashToken(newRefreshToken);

    await db.insert(refreshTokens).values({
      user_id: user.id,
      token_hash: newRefreshTokenHash,
      expires_at: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    });

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
    };
  },

  async getMe(user: AuthUser) {
    const [dbUser] = await db
      .select({
        id: users.id,
        phone: users.phone,
        email: users.email,
        role: users.role,
        full_name: users.full_name,
        avatar_url: users.avatar_url,
        created_at: users.created_at,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!dbUser) throw new NotFoundError('User not found');

    return {
      id: dbUser.id,
      phone: dbUser.phone,
      email: dbUser.email,
      role: dbUser.role,
      full_name: dbUser.full_name,
      avatar_url: dbUser.avatar_url,
      created_at: dbUser.created_at?.toISOString() ?? null,
    };
  },

  async logout(user: AuthUser) {
    await db.delete(refreshTokens).where(eq(refreshTokens.user_id, user.id));
    logger.info('[AUTH] Logout — all refresh tokens revoked', { userId: user.id.split('-')[0] });
    return { message: 'Logged out successfully' };
  },
};
