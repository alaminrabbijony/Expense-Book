import { defineConfig } from "drizzle-kit";

// drizzle-kit runs this file itself, not through `node --env-file`, so it has
// to load .env on its own. process.loadEnvFile() is built into Node (20.12+)
// and reads ./.env relative to where the command is run: apps/server.
process.loadEnvFile();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is missing from apps/server/.env");

export default defineConfig({
  schema: "./src/db/schema.ts",
  // Generated SQL lands here and IS committed: it is the server's migration
  // history, the Postgres twin of the MIGRATIONS array in db/migrations.ts.
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});