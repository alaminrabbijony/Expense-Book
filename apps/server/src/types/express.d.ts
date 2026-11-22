/* ── Request augmentation ────────────────────────────────────────────────────
 * Adds our own fields to Express's Request type, so `req.requestId` is typed
 * everywhere with no casting. A .d.ts file holds types only and never runs,
 * so `namespace` is fine here even under erasableSyntaxOnly.
 *
 * POS's user, jwtPayload and resolvedShopId stay out until Milestone 8.
 * ─────────────────────────────────────────────────────────────────────────── */
export {};

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}