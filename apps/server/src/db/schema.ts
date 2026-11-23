import { bigint, pgTable, text } from "drizzle-orm/pg-core";

// The server's copy of the phone's `expenses` table (apps/mobile/db/migrations.ts).
// Same column names, same meanings, so a row can cross between the two
// databases without being translated. Where a column differs, the comment
// says why.
export const expenses = pgTable("expenses", {
  // The PHONE makes the id (timestamp + random), so the server never does.
  // Not a uuid column: existing phone ids are not UUIDs.
  id: text("id").primaryKey(),

  title: text("title").notNull(),

  // bigint, not integer: SQLite's INTEGER is 64-bit, Postgres's `integer` is
  // 32-bit and stops at 2,147,483,647 paisa. mode "number" hands JavaScript a
  // plain number instead of a string; safe up to 2^53, far past any expense.
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),

  currencyCode: text("currency_code").notNull(),

  // Epoch milliseconds, exactly as the phone stores it. Not timestamptz: the
  // two databases hold the same value in the same form.
  createdAt: bigint("created_at", { mode: "number" }).notNull(),

  // Nullable and NO foreign key. The phone's column is nullable too, but on
  // the phone it REFERENCES categories(id); the server has no categories table
  // yet, and Postgres would reject every insert against an empty one.
  categoryId: text("category_id"),
});