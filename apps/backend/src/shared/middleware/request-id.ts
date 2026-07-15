import { Elysia } from 'elysia';
import { logger } from '../lib/logger';

let requestCount = 0;

function isNoisy(pathname: string): boolean {
  return (
    pathname === '/health' ||
    pathname === '/ready' ||
    pathname === '/metrics' ||
    pathname === '/docs' ||
    pathname.startsWith('/docs/')
  );
}

export const requestId = new Elysia({ name: 'request-id' })
  .onRequest(({ request }) => {
    const url = new URL(request.url);
    if (isNoisy(url.pathname)) return;
    logger.debug('→', request.method, url.pathname);
  })
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
  .onAfterHandle({ as: 'scoped' }, ({ request, set, _metrics, log }) => {
    const duration = Date.now() - (_metrics as { start: number }).start;
    const url = new URL(request.url);
    const status = Number(set.status ?? 200);
    const method = request.method;

    if (isNoisy(url.pathname)) return;

    if (status >= 400) {
      log.warn(method, url.pathname, status, `${duration}ms`);
    } else {
      log.info(method, url.pathname, status, `${duration}ms`);
    }
  })
  .onError({ as: 'scoped' }, ({ request, set, _metrics, error, code, log }) => {
    const duration = Date.now() - ((_metrics as { start: number })?.start ?? Date.now());
    const url = new URL(request.url);
    const status = set.status ?? 500;

    if (isNoisy(url.pathname)) return;

    const l = log ?? logger;
    l.error(
      code ?? 'UNKNOWN',
      request.method,
      url.pathname,
      status,
      `${duration}ms`,
      (error as Error)?.message ?? 'Unknown error',
    );
  });
