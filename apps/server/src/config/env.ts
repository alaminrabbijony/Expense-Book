import { z, ZodError } from 'zod';

/* ── Where the values come from ──────────────────────────────────────────────
 * `node --env-file=.env` (the dev script) loads .env into process.env BEFORE
 * any of our code runs. This file does not load anything; it only checks.
 * That replaces Bytedash's dotenv + dotenv-expand with nothing to install.
 * ─────────────────────────────────────────────────────────────────────────── */

/* ── Environment Schema ──────────────────────────────────────────────────────
 * Every variable is a string in process.env. z.coerce turns "4000" into 4000
 * before the number checks run .
 * ─────────────────────────────────────────────────────────────────────────── */
const EnvSchema = z.object({
  // No default on purpose: a server that guesses its environment can run
  // production with development's error detail switched on.
  NODE_ENV: z.enum(['development', 'staging', 'production']),

  PORT: z.coerce.number().int().positive().default(4000),

  // Read from 7b on (the database step). Checked from day one so a typo in
  // .env fails at startup, not at the first query.
  DATABASE_URL: z.url(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

/* ── Parse once, export once ─────────────────────────────────────────────────
 * The app must never boot with a broken environment: print every problem,
 * then exit. console.error, not the logger: the logger reads this file.
 * ─────────────────────────────────────────────────────────────────────────── */
const validateEnv = (): Env => {
  try {
    return EnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof ZodError) {
      const problems = error.issues
        .map((issue) => `  ✗ ${issue.path.join('.')}: ${issue.message}`)
        .join('\n');
      console.error(`Invalid environment configuration in apps/server/.env:\n${problems}`);
    } else {
      console.error('Unexpected error while validating the environment:', error);
    }
    process.exit(1);
  }
};

const env = validateEnv();

export default env;