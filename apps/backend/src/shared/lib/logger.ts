const LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isProd = process.env.NODE_ENV === 'production';
const configuredLevel = process.env.LOG_LEVEL?.toLowerCase() ?? (isProd ? 'info' : 'debug');
const minLevel = LEVELS[configuredLevel] ?? (isProd ? 1 : 0);

function timestamp(): string {
  return new Date().toISOString();
}

function format(level: string, args: any[], context?: Record<string, unknown>): void {
  if ((LEVELS[level] ?? 1) < minLevel) return;

  const ts = timestamp();
  const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');

  if (isProd) {
    const entry: Record<string, unknown> = { ts, level, message };
    if (context) Object.assign(entry, context);
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  } else {
    const prefix =
      {
        debug: '🔍',
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
      }[level] || '•';

    const ctxStr = context ? ` ${JSON.stringify(context)}` : '';
    console.log(`${prefix} [${level.toUpperCase()}] ${ts} ${message}${ctxStr}`);
  }
}

function createScopedLogger(context: Record<string, unknown>) {
  return {
    debug(...args: any[]) {
      format('debug', args, context);
    },
    info(...args: any[]) {
      format('info', args, context);
    },
    warn(...args: any[]) {
      format('warn', args, context);
    },
    error(...args: any[]) {
      format('error', args, context);
    },
  };
}

export const logger = {
  ...createScopedLogger({}),
  scoped: createScopedLogger,
};
