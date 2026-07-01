import { Elysia } from 'elysia';
import { httpRequestDurationSeconds, httpRequestsTotal } from '../lib/metrics';

export const metricsMiddleware = new Elysia({ name: 'metrics' })
  .derive({ as: 'scoped' }, () => {
    return { _metricsStart: performance.now() };
  })
  .onAfterHandle({ as: 'scoped' }, ({ request, set, _metricsStart }) => {
    const duration = (performance.now() - _metricsStart) / 1000;
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname;
    const status = String(set.status || 200);

    httpRequestsTotal.inc({ method, path, status });
    httpRequestDurationSeconds.observe({ method, path }, duration);
  })
  .onError({ as: 'scoped' }, ({ request, set, _metricsStart }) => {
    const duration = (_metricsStart ? performance.now() - _metricsStart : 0) / 1000;
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname;
    const status = String(set.status || 500);

    httpRequestsTotal.inc({ method, path, status });
    httpRequestDurationSeconds.observe({ method, path }, duration);
  });
