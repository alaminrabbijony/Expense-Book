/* ── Error codes ─────────────────────────────────────────────────────────────
 * Every error this API returns carries one of these. The phone switches on
 * `code`, never on `message`, so adding a code is a change to the contract
 * with the phone. Four today; UNAUTHORIZED and FORBIDDEN arrive at Milestone 8.
 * ─────────────────────────────────────────────────────────────────────────── */
export type ErrorCode =
  | 'VALIDATION_ERROR' // 400 — the body has the wrong shape (7e)
  | 'NOT_FOUND' //        404 — no such route or row
  | 'CONFLICT' //         409 — a repeated id (7d)
  | 'INTERNAL_ERROR'; //  500 — a bug. The client never sees why

type Details = Record<string, unknown> | unknown[];

/* ── AppError ────────────────────────────────────────────────────────────────
 * The POS system's base class, unchanged in shape. Every error we throw ON
 * PURPOSE is a subclass. The constructor is protected, so `new AppError()`
 * does not compile: only a subclass, which fixes statusCode and code
 * together, can be thrown.
 *
 * Plain class fields, not constructor parameter properties: Node strips
 * types to run this file, and parameter properties cannot be stripped.
 * ─────────────────────────────────────────────────────────────────────────── */
export class AppError extends Error {
  readonly status: 'fail' | 'error';
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details: Details | undefined;

  protected constructor(message: string, statusCode: number, code: ErrorCode, details?: Details) {
    super(message);
    // 'fail' = the client sent something wrong (4xx); 'error' = we broke (5xx).
    // Same word pair as the success envelope's `status: 'success'`.
    this.status = statusCode >= 500 ? 'error' : 'fail';
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/* ── The four subclasses ─────────────────────────────────────────────────────
 * Each one locks its status and code; a caller only chooses the message.
 * Every one has a default message, so a response never says `undefined`.
 * ─────────────────────────────────────────────────────────────────────────── */
export class ValidationError extends AppError {
  constructor(message = 'Invalid request data', details?: Details) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Request conflicts with current state', details?: Details) {
    super(message, 409, 'CONFLICT', details);
  }
}

/* InternalError is ASSIGNED by the error handler to anything that is not an
   AppError. Nothing throws it on purpose: a bug is, by definition, not on
   purpose. */
export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred') {
    super(message, 500, 'INTERNAL_ERROR');
  }
}