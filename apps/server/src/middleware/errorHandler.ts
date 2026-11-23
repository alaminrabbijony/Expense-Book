import type { NextFunction, Request, Response } from 'express';

import env from '../config/env.ts';
import { AppError, type ErrorCode, InternalError } from '../lib/errors.ts';
import { logger } from '../lib/logger.ts';

/* ── Error types, and their icons ────────────────────────────────────────────
 * DOMAIN:  an AppError we threw on purpose (404, and 400/409 later). Expected.
 * UNKNOWN: anything else. A bug — read the stack.
 * (7d adds INFRA: a database error translated into an AppError.)
 *
 * The icon goes at the start of the log MESSAGE only. Meaning lives in the
 * plain-text fields `errType` and `code`, so a log search never depends on an
 * emoji, and a terminal that cannot draw one loses nothing but decoration.
 * ─────────────────────────────────────────────────────────────────────────── */
type ErrType = 'DOMAIN' | 'UNKNOWN';

const ICON: Record<ErrType, string> = {
  DOMAIN: '🟡',
  UNKNOWN: '💥',
};

/* ── The one envelope ────────────────────────────────────────────────────────
 * Every error response this server sends has this shape, because this file
 * is the only place an error response is built. Routes, the 404 and (7e)
 * validate THROW; they never call res.status().json() for an error.
 * ─────────────────────────────────────────────────────────────────────────── */
type ErrorBody = {
  status: 'fail' | 'error';
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, unknown> | unknown[];
    stack?: string;
  };
};

/* ── Global error handler ────────────────────────────────────────────────────
 * Express recognises an error handler by its FOUR parameters. Remove `_next`
 * and Express treats this as ordinary middleware: errors skip it silently.
 * Registered last in app.ts.
 * ─────────────────────────────────────────────────────────────────────────── */
export const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction): void => {
  // Step 1. Part of the response already went out (a stream failed midway).
  // A second status line is impossible; Express's own handler closes the
  // connection, which is the only honest thing left to do.
  if (res.headersSent) {
    next(err);
    return;
  }

  // Step 2. Normalise. Assign, never throw: a throw inside the error handler
  // has no error handler left to catch it.
  const isKnown = err instanceof AppError;
  const appErr: AppError = isKnown ? err : new InternalError();
  const errType: ErrType = isKnown ? 'DOMAIN' : 'UNKNOWN';

  // Step 3. Log once. 4xx is the client's mistake → warn. 5xx is ours → error.
  // For an UNKNOWN error the ORIGINAL goes in the log — message and stack —
  // because the response below will not carry it.
  const logContext = {
    requestId: req.requestId,
    errType,
    code: appErr.code,
    statusCode: appErr.statusCode,
    method: req.method,
    path: req.path,
    ...(!isKnown && {
      original:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : { raw: String(err) },
    }),
  };
  const line = `${ICON[errType]} ${appErr.code}: ${appErr.message}`;
  if (appErr.statusCode >= 500) logger.error(logContext, line);
  else logger.warn(logContext, line);

  // Step 4. Build the response. A 5xx never carries its message or details:
  // either could hold internals (a query, a value, a path on disk).
  const isSafe = appErr.statusCode < 500;
  const body: ErrorBody = {
    status: appErr.status,
    error: {
      code: appErr.code,
      message: isSafe ? appErr.message : 'An unexpected error occurred',
      requestId: req.requestId,
    },
  };
  if (isSafe && appErr.details !== undefined) body.error.details = appErr.details;

  // Development only: the stack of what was actually thrown. It starts with
  // the original message, so in development a 500 is NOT fully masked — on
  // purpose. Production never sends it.
  if (env.NODE_ENV === 'development' && err instanceof Error && err.stack) {
    body.error.stack = err.stack;
  }

  res.status(appErr.statusCode).json(body);
};