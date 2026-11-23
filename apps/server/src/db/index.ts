import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import env from '../config/env.ts';
import { logger } from '../lib/logger.ts';
import * as schema from './schema.ts';

/* ── Connection Pool ─────────────────────────────────────────────────────────
 * Your Bytedash pool, unchanged in substance. Exported only so closeDB() can
 * drain it; queries go through `db` below, never through `pool` directly.
 *
 * max:                    DB_POOL_MAX from .env (default 10)
 * idleTimeoutMillis:      release a connection idle for 30s
 * connectionTimeoutMillis 5s — fail fast, matches initDB's 5s race
 * allowExitOnIdle:        an idle pool never keeps the process alive
 * ─────────────────────────────────────────────────────────────────────────── */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: true,
});

/* ── Pool error handler ──────────────────────────────────────────────────────
 * An IDLE connection can die (Postgres restarted, Docker stopped). pg reports
 * that as an 'error' event on the pool. With no listener, Node treats an
 * unlistened 'error' event as an uncaught exception and the server crashes.
 * With this listener it is logged and the pool opens a fresh connection the
 * next time one is needed.
 * ─────────────────────────────────────────────────────────────────────────── */
pool.on('error', (err) => {
  logger.warn(
    { event: 'pool_idle_error', err: { name: err.name, message: err.message } },
    'Idle PostgreSQL connection failed — pool will recover',
  );
});

/* ── Drizzle client ──────────────────────────────────────────────────────────
 * The one place drizzle() is called. Import `db` from here everywhere.
 * SQL logging needs BOTH gates (Bytedash's rule): development AND debug, so
 * a stray LOG_LEVEL=debug in production never prints queries with values.
 * ─────────────────────────────────────────────────────────────────────────── */
export const db = drizzle(pool, {
  schema,
  logger: env.NODE_ENV === 'development' && env.LOG_LEVEL === 'debug',
});

export type Database = typeof db;

/* ── Lifecycle ───────────────────────────────────────────────────────────────
 * initDB():  one `SELECT 1` before the server listens. A server that accepts
 *            requests before it knows Postgres answers looks healthy until
 *            the first tap on Add.
 * closeDB(): drain the pool during graceful shutdown, after the HTTP server
 *            has closed, so no request is still using a connection.
 * ─────────────────────────────────────────────────────────────────────────── */
export async function initDB(): Promise<void> {
  await db.execute(sql`SELECT 1`);
  logger.info({ event: 'db_ready' }, 'Database connection verified');
}

export async function closeDB(): Promise<void> {
  await pool.end();
  logger.info({ event: 'db_closed' }, 'Database pool drained');
}