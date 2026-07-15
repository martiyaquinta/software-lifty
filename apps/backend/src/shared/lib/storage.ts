import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

let supabase: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (url && key) {
      supabase = createClient(url, key, {
        auth: { persistSession: false },
      });
    }
  }
  return supabase;
}

async function retry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 1000): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      logger.warn('[STORAGE] Retry', { attempt: i + 1, error: (err as Error).message });
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw new Error('Unreachable');
}

export async function uploadFile(file: File, path: string): Promise<string> {
  const client = getClient();
  if (!client) {
    logger.info('[STORAGE] Upload (mock):', path, `(${file.size} bytes)`);
    return `mock://storage.lifty/${path}`;
  }

  const { data, error } = await retry(() =>
    client.storage.from('driver-documents').upload(path, file, { upsert: true }),
  );
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: urlData } = client.storage.from('driver-documents').getPublicUrl(data.path);
  return urlData.publicUrl;
}

export async function getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const client = getClient();
  if (!client) {
    return `mock://storage.lifty/${path}`;
  }

  const { data, error } = await retry(() =>
    client.storage.from('driver-documents').createSignedUrl(path, expiresIn),
  );
  if (error) throw new Error(`Signed URL failed: ${error.message}`);
  return data.signedUrl;
}
