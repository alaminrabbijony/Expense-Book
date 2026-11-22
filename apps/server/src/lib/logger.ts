import pino from 'pino';

import env from '../config/env.ts';

/* ── Logger ──────────────────────────────────────────────────────────────────
 * Structured JSON lines in production;
 * pino-pretty turns them into coloured, readable lines in development only,
 * because a log aggregator wants JSON and a human at a terminal does not.
 * ─────────────────────────────────────────────────────────────────────────── */
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});