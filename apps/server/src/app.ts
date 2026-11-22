import { randomUUID } from 'node:crypto';

import express, { type NextFunction, type Request, type Response } from 'express';

import { logger } from './lib/logger.ts';

const app = express();

/* ═══════════════════════════════════════════════════════════════════════════
   1. DISABLE FINGERPRINTING
   Express announces itself with an X-Powered-By header unless told not to.
   (POS's helmet, CORS and trust proxy stay out: CORS is a browser rule
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
   /health/live answers "is the process running". /health/ready (does the
   database answer too) arrives with the database in 7b.
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

// Routes (7e), the 404 handler and the global error handler (7c) go below,
// in that order: Express runs middleware top to bottom.

export default app;