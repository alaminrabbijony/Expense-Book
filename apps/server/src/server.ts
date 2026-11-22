import type { Server } from 'node:http';
import type { Socket } from 'node:net';

import app, { activeReq } from './app.ts';
import env from './config/env.ts';
import { logger } from './lib/logger.ts';

let server: Server | undefined;
let isShuttingDown = false;

/* ── Open sockets ────────────────────────────────────────────────────────────
 * A Set of live connections, so shutdown can destroy the ones still open.
 * server.close() alone waits for keep-alive clients, which can be forever.
 * ─────────────────────────────────────────────────────────────────────────── */
const openSockets = new Set<Socket>();

/* ── Error normalizer ────────────────────────────────────────────────────────
 * An unhandled rejection's reason is `unknown`: libraries reject with
 * strings, plain objects, even undefined. Turn it into an Error for logging.
 * ─────────────────────────────────────────────────────────────────────────── */
const normalizeError = (reason: unknown): Error => {
  if (reason instanceof Error) return reason;
  if (typeof reason === 'string') return new Error(reason);
  try {
    return new Error(JSON.stringify(reason));
  } catch {
    return new Error(`Non-serializable error: ${Object.prototype.toString.call(reason)}`);
  }
};

/* ── Crash handlers ──────────────────────────────────────────────────────────
 * The process is in an unknown state: log once and exit. A restart is
 * recoverable; a half-written row is not. Registered before anything listens.
 * ─────────────────────────────────────────────────────────────────────────── */
process.on('uncaughtException', (err) => {
  logger.fatal({ type: 'UNCAUGHT_EXCEPTION', err }, 'Fatal: uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal(
    { type: 'UNHANDLED_REJECTION', err: normalizeError(reason) },
    'Fatal: unhandled rejection',
  );
  process.exit(1);
});

/* ── OS signals ──────────────────────────────────────────────────────────────
 * SIGINT is Ctrl+C. SIGTERM is what Docker or a process manager sends.
 * ─────────────────────────────────────────────────────────────────────────── */
process.on('SIGINT', () => void gracefulShutdown('SIGINT', 0));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM', 0));

/* ── Graceful shutdown ───────────────────────────────────────────────────────
 * Order matters:
 *   1. wait for in-flight requests (activeReq → 0), so none is cut mid-write
 *   2. destroy the sockets still open (idle keep-alive connections)
 *   3. server.close(), which now resolves at once
 *   (4. drain the database pool — added in 7b)
 * A 10s timer kills the process if any step hangs. unref() stops that timer
 * from keeping the process alive by itself.
 * ─────────────────────────────────────────────────────────────────────────── */
async function gracefulShutdown(signal: string, exitCode: number): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const shutdownStart = Date.now();
  logger.info({ event: 'shutdown_start', signal }, 'Shutdown started');

  const forceExit = setTimeout(() => {
    logger.error({ event: 'shutdown_timeout' }, 'Shutdown took over 10s. Forcing exit');
    process.exit(1);
  }, 10_000).unref();

  try {
    if (server) {
      server.keepAliveTimeout = 0;

      while (activeReq > 0) {
        logger.info({ event: 'shutdown_draining', activeReq }, 'Waiting for in-flight requests');
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }

      for (const socket of openSockets) socket.destroy();
      openSockets.clear();

      const closing = server;
      await new Promise<void>((resolve) => closing.close(() => resolve()));
      logger.info({ event: 'server_closed' }, 'HTTP server closed');
    }

    clearTimeout(forceExit);
    logger.info(
      { event: 'shutdown_complete', durationMs: Date.now() - shutdownStart },
      'Shutdown complete',
    );
    process.exit(exitCode);
  } catch (err) {
    logger.error({ event: 'shutdown_error', err }, 'Error during shutdown');
    process.exit(1);
  }
}

/* ── Bootstrap ───────────────────────────────────────────────────────────────
 * Phase 1: env is validated the moment config/env.ts is imported (above).
 * Phase 2: the database check before listen() — added in 7b.
 * Phase 3: listen, and track sockets from the first connection.
 * Phase 4: a port that is busy or forbidden exits with a clear line.
 * ─────────────────────────────────────────────────────────────────────────── */
function bootstrap(): void {
  server = app.listen(env.PORT, () => {
    logger.info(
      { event: 'server_start', port: env.PORT, env: env.NODE_ENV },
      `Server listening on port ${env.PORT}`,
    );
  });

  server.on('connection', (socket: Socket) => {
    openSockets.add(socket);
    socket.on('close', () => openSockets.delete(socket));
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${env.PORT} is already in use`);
    } else if (err.code === 'EACCES') {
      logger.error(`Port ${env.PORT} needs elevated privileges`);
    } else {
      logger.error({ err }, 'Server failed to bind');
    }
    process.exit(1);
  });
}

bootstrap();