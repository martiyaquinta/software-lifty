import { logger } from './logger';

let resendClient: any = null;

function getClient(): any {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        const { Resend } = require('resend');
        resendClient = new Resend(apiKey);
      } catch {
        logger.warn('[EMAIL] Failed to initialize Resend client');
      }
    }
  }
  return resendClient;
}

export async function sendEmail(email: string, subject: string, html: string): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production' && process.env.SEND_EMAILS_IN_DEV !== 'true') {
    logger.info('[EMAIL]', email, '|', subject);
    return true;
  }

  const client = getClient();
  if (!client) {
    logger.warn('[EMAIL] Resend not configured — email not sent');
    return false;
  }

  try {
    const result = await client.emails.send({
      from: process.env.EMAIL_FROM ?? 'Lifty <noreply@liftyviajes.com>',
      to: email,
      subject,
      html,
    });

    if (result.error) {
      logger.error(
        '[EMAIL] Resend error to',
        email,
        ':',
        result.error.statusCode,
        result.error.message,
      );
      return false;
    }

    logger.info('[EMAIL] Sent to', email);
    return true;
  } catch (err) {
    logger.error('[EMAIL] Send failed to', email, ':', (err as Error).message);
    return false;
  }
}
