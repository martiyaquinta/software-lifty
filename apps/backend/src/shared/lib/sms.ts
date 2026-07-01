import { logger } from './logger';

let twilioClient: any = null;

function getClient(): any {
  if (!twilioClient) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (sid && token) {
      try {
        const twilio = require('twilio');
        twilioClient = twilio(sid, token);
      } catch {
        logger.warn('[SMS] Failed to initialize Twilio client');
      }
    }
  }
  return twilioClient;
}

export async function sendSms(phone: string, message: string): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') {
    const masked = phone.slice(-4).padStart(phone.length, '*');
    logger.info('[SMS]', masked, 'message sent');
    return true;
  }

  const client = getClient();
  if (!client) {
    logger.warn('[SMS] Twilio not configured — SMS not sent');
    return false;
  }

  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });
    const masked = phone.slice(-4).padStart(phone.length, '*');
    logger.info('[SMS]', masked, 'message sent (real)');
    return true;
  } catch (err) {
    const masked = phone.slice(-4).padStart(phone.length, '*');
    logger.error('[SMS]', masked, 'send failed:', (err as Error).message);
    return false;
  }
}
