import { and, eq, gt } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { refreshTokens, users } from '../../shared/db/schema';
import { sendEmail } from '../../shared/lib/email';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../shared/lib/errors';
import { hashToken, signAccess, signRefresh, verifyAccess } from '../../shared/lib/jwt';
import { logger } from '../../shared/lib/logger';
import type { AuthUser } from '../../shared/middleware/auth';

const REFRESH_TOKEN_DAYS = 30;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const authService = {
  async register(email: string, password: string) {
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
    const codeExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

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

    logger.info('[AUTH] Register — user created', {
      userId: user.id.split('-')[0],
      code: verificationCode,
    });

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #0D2B45;">Bienvenido a Lifty</h2>
        <p style="color: #A8B1BA; font-size: 16px;">Tu codigo de verificacion es:</p>
        <div style="background: #F1F4F6; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; color: #0D2B45; letter-spacing: 8px;">${verificationCode}</span>
        </div>
        <p style="color: #A8B1BA; font-size: 14px;">Este codigo expira en 1 hora.</p>
      </div>
    `;

    const sent = await sendEmail(email, 'Verifica tu cuenta de Lifty', emailHtml);
    logger.info('[AUTH] Register — email sent', { email, sent });

    return {
      id: user.id,
      email: user.email,
      message: 'Cuenta creada. Revisa tu email para el codigo de verificacion.',
    };
  },

  async verifyEmail(email: string, code: string) {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        email_verified: users.email_verified,
        verification_code: users.verification_code,
        verification_code_expires_at: users.verification_code_expires_at,
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

    if (user.verification_code !== code) {
      throw new BadRequestError('Codigo de verificacion invalido');
    }

    if (!user.verification_code_expires_at || user.verification_code_expires_at < new Date()) {
      throw new BadRequestError('El codigo expiro. Solicita uno nuevo.');
    }

    await db
      .update(users)
      .set({
        email_verified: true,
        verification_code: null,
        verification_code_expires_at: null,
      })
      .where(eq(users.id, user.id));

    logger.info('[AUTH] Email verified', { userId: user.id.split('-')[0] });

    return { message: 'Email verificado correctamente' };
  },

  async login(email: string, password: string) {
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
