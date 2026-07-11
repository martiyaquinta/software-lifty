import { AppError } from './errors';

export async function safeCall<T>(fn: () => Promise<T>, set: { status: number }) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) {
      set.status = err.statusCode;
      return {
        error: { code: err.code, message: err.message, status: err.statusCode },
        meta: { timestamp: new Date().toISOString() },
      };
    }
    const statusCode =
      (err as Record<string, unknown>).statusCode ?? (err as Record<string, unknown>).status ?? 500;
    set.status =
      typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600 ? statusCode : 500;
    const message =
      process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
        ? (err as Error).message
        : 'Internal server error';
    return {
      error: { code: 'INTERNAL_ERROR', message, status: set.status as number },
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
