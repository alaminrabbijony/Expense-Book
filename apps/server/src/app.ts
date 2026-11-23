import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import express, { type NextFunction, type Request, type Response } from 'express';

import { db } from './db/index.ts';

import { logger } from './lib/logger.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { NotFoundError } from './lib/errors.ts';


const app = express();

/* ═══════════════════════════════════════════════════════════════════════════
   1. DISABLE FINGERPRINTING
   Express announces itself with an X-Powered-By header unless told not to.
   (Bytedash's helmet, CORS and trust proxy stay out: CORS is a browser rule
   the phone's fetch never meets, and trust proxy is only safe behind a proxy.)
═══════════════════════════════════════════════════════════════════════════ */
app.disable('x-powered-by');

/* ═══════════════════════════════════════════════════════════════════════════
   2. BODY PARSING
   1mb ceiling: parses raw bytes only. Zod checks the shape later (7e/7f).
═══════════════════════════════════════════════════════════════════════════ */
app.use(express.json({ limit: '1mb' }));

/* ═══════════════════════════════════════════════════════════════════════════
   3. REQUEST CONTEXT
   One id per request. It goes on every log line and back to the client as
   X-Request-Id, so an error the phone shows can be matched to a server log.
═══════════════════════════════════════════════════════════════════════════ */
app.use((req: Request, res: Response, next: NextFunction) => {
  req.requestId = randomUUID();
  req.startTime = Date.now();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. ACTIVE REQUEST COUNTER
   server.ts waits for this to reach 0 before destroying sockets on shutdown.
   'close' as well as 'finish': a client that disconnects mid-request never
   fires 'finish', and the counter would never get back to 0.
   `export let` is read live by server.ts — an ES module import is a live
   view of this variable, not a copy taken at import time.
═══════════════════════════════════════════════════════════════════════════ */
export let activeReq = 0;

app.use((_req: Request, res: Response, next: NextFunction) => {
  activeReq++;
  let decremented = false;
  const decrement = () => {
    if (!decremented) {
      decremented = true;
      activeReq--;
    }
  };
  res.on('finish', decrement);
  res.on('close', decrement);
  next();
});

/* ═══════════════════════════════════════════════════════════════════════════
   5. REQUEST LOGGING
   Logged on 'finish', so the status code is the real one after every
   handler (and later the error handler) has run.
═══════════════════════════════════════════════════════════════════════════ */
app.use((req: Request, res: Response, next: NextFunction) => {
  res.on('finish', () => {
    logger.info({
      type: 'request',
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - req.startTime,
      ip: req.ip,
    });
  });
  next();
});

/* ═══════════════════════════════════════════════════════════════════════════
   6. HEALTH — the pulse
   /health/live answers "is the process running". It never touches the
   database, so it stays green while Postgres is down — on purpose.
═══════════════════════════════════════════════════════════════════════════ */
app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    data: {
      timeStamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

/* /health/ready answers "can this server do its job right now", which means
   Postgres answers too. 503 = alive but not ready: a load balancer (or you,
   with curl) can tell "process down" from "database down". */
app.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.status(200).json({ status: 'success', data: { db: 'connected' } });
  } catch {
    res.status(503).json({ status: 'error', data: { db: 'unreachable' } });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   7. ROUTES
   The expense router arrives at 7e, here, above the 404.
═══════════════════════════════════════════════════════════════════════════ */

// TEMPORARY — checkpoint 7c only. Comment it out once the checkpoint passes
// (the standing dev-tools rule). It throws a plain Error, which is exactly
// what a bug looks like, and its message holds a fake secret: the 500 test
// passes only if that word never reaches the client's `message`.


// app.get('/debug/crash', () => {
//   throw new Error('Deliberate crash: SECRET-DO-NOT-LEAK');
// });

/* ═══════════════════════════════════════════════════════════════════════════
   8. 404 — no route matched
   Registered after every route, so a request reaches it only if nothing above
   answered. It THROWS (via next) instead of answering: the error handler below
   is the one place that builds an error response.
   No path argument, on purpose: Express 5 rejects a bare '*' at startup.
═══════════════════════════════════════════════════════════════════════════ */
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
});

/* ═══════════════════════════════════════════════════════════════════════════
   9. GLOBAL ERROR HANDLER — always last
═══════════════════════════════════════════════════════════════════════════ */
app.use(errorHandler);

export default app;