import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { users } from '../../shared/db/schema';
import { sendEmail } from '../../shared/lib/email';
import { logger } from '../../shared/lib/logger';

function adminEmailsFromEnv(): string[] {
  const extra = process.env.ADMIN_EMAIL;
  if (!extra) return [];
  return extra
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

export async function notifyAdminsNewDocuments(
  driverName: string,
  driverId: string,
): Promise<void> {
  try {
    const adminRows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.role, 'admin'));

    const recipients = new Set([
      ...adminRows.map((r) => r.email).filter((e): e is string => !!e),
      ...adminEmailsFromEnv(),
    ]);

    if (recipients.size === 0) {
      logger.info('[ADMIN-NOTIFY] No admin recipients configured');
      return;
    }

    const subject = 'Nuevo conductor para revisar';
    const html = `
      <p>El conductor <strong>${driverName}</strong> ha subido sus documentos y esta pendiente de revision.</p>
      <p>ID del conductor: ${driverId}</p>
    `;

    for (const email of recipients) {
      await sendEmail(email, subject, html);
    }
  } catch (err) {
    logger.error('[ADMIN-NOTIFY] Failed to send notifications', (err as Error).message);
  }
}

export async function notifyDriverApproved(driverEmail: string, driverName: string): Promise<void> {
  try {
    const subject = 'Tus documentos fueron aprobados';
    const html = `
      <p>Hola <strong>${driverName}</strong>,</p>
      <p>Tus documentos fueron <strong>aprobados</strong>. Ya podes empezar a conducir con Lifty.</p>
    `;
    await sendEmail(driverEmail, subject, html);
  } catch (err) {
    logger.error('[DRIVER-NOTIFY] Failed to send approved email', (err as Error).message);
  }
}

export async function notifyDriverRejected(
  driverEmail: string,
  driverName: string,
  reason?: string | null,
): Promise<void> {
  try {
    const subject = 'Tus documentos fueron rechazados';
    const html = `
      <p>Hola <strong>${driverName}</strong>,</p>
      <p>Tus documentos fueron <strong>rechazados</strong>.</p>
      ${reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : ''}
      <p>Por favor volve a subir tus documentos en la app de Lifty.</p>
    `;
    await sendEmail(driverEmail, subject, html);
  } catch (err) {
    logger.error('[DRIVER-NOTIFY] Failed to send rejected email', (err as Error).message);
  }
}
