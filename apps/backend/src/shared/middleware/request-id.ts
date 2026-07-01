import { Elysia } from 'elysia';
import { logger } from '../lib/logger';

let requestCount = 0;

export const requestId = new Elysia({ name: 'request-id' })
  .derive({ as: 'scoped' }, ({ request, set }) => {
    const id = request.headers.get('x-request-id') || crypto.randomUUID();
    set.headers['X-Request-ID'] = id;

    const num = ++requestCount;
    const start = Date.now();

    return {
      requestId: id,
      log: logger.scoped({ requestId: id }),
      _metrics: { num, start },
    };
  })
  .onAfterHandle(({ _metrics, log }) => {
    const duration = Date.now() - (_metrics as { start: number }).start;
    log.debug('request completed', { duration_ms: duration });
  });
