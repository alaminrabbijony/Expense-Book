import { asMinor, DEFAULT_CURRENCY, type Minor } from "@et/shared";
import { all, run, tx } from ".";

// The one category row that must never be deleted or renamed. Migration 4
// creates it, the backfill points 50,013 rows at it, and every insert since
// then names it explicitly.
//
// Exported because 5e's picker needs to recognise it — it is the row that
// should not get a delete button.
export const UNCATEGORISED_ID = "uncategorised";

export type Expense = {
  id: string;
  title: string;
  amountMinor: Minor;
  currencyCode: string;
  createdAt: number;
};

// What SQLite actually hands back: snake_case, exactly as declared.
type ExpenseRow = {
  id: string;
  title: string;
  amount_minor: number;
  currency_code: string;
  created_at: number;
};

const toExpense = (row: ExpenseRow): Expense => {
  return {
    id: row.id,
    title: row.title,
    // The read boundary. SQLite hands back an untyped number and this
    // is the only place it becomes Minor. A stored float throws here,
    // loudly, instead of being rounded away by the display.
    amountMinor: asMinor(row.amount_minor),
    currencyCode: row.currency_code,
    createdAt: row.created_at,
  };
};

export const PAGE_SIZE = 50;

// One page of expenses, newest first.
// offset = how many rows to skip. 0 for the first page, 50 for the second.

// SQLite plans around the SELECT and the ORDER BY. The LIMIT/OFFSET
// tail does not change the plan. Kept in one place so the probe below
// describes the query that actually runs, not a copy free to drift.
const LIST_PAGE_SELECT = `SELECT id, title, amount_minor, currency_code, created_at
       FROM expenses
      ORDER BY created_at DESC, id DESC`;

export const listExpensePage = (offset: number): Expense[] => {
  const rows = all<ExpenseRow>(`${LIST_PAGE_SELECT} LIMIT ? OFFSET ?`, [
    PAGE_SIZE,
    offset,
  ]);
  return rows.map(toExpense);
};


// DEV ONLY. Asks SQLite how it INTENDS to answer the paging query.
// EXPLAIN QUERY PLAN never executes the query, so this costs the same
// at 50,000 rows as at 50.
export const explainListPage = (): void => {
  const show = (label: string, sql: string, params?: number[]) => {
    try {
      // Typed loosely on purpose. The column names EXPLAIN QUERY PLAN
      // returns have changed between SQLite versions. We print whatever
      // arrives rather than assert a shape we have not seen.
      const rows = all<Record<string, unknown>>(sql, params);
      console.log(`--- plan (${label}) ---\n${JSON.stringify(rows, null, 2)}`);
    } catch (err) {
      // Not a bare catch. If the wrapper cannot carry a plan back,
      // that failure IS the measurement and we need to read it.
      console.log(`--- plan (${label}) FAILED ---`, String(err));
    }
  };

  // Literal numbers first. This version cannot trip on a parameter
  // mismatch, so if it also fails, the problem is EXPLAIN itself.
  show("literal", `EXPLAIN QUERY PLAN ${LIST_PAGE_SELECT} LIMIT ${PAGE_SIZE} OFFSET 0`);

  // Then the real shape. The VALUES cannot affect a plan, because the
  // query never runs. But the SQL TEXT differs, and text is what the
  // planner reads. Two matching outputs turn that into a fact.
  show("bound", `EXPLAIN QUERY PLAN ${LIST_PAGE_SELECT} LIMIT ? OFFSET ?`, [
    PAGE_SIZE,
    0,
  ]);
};




// COUNT and SUM are "aggregate" functions — they squash many rows
// into one value. SQLite does the work internally, so no rows and
// no objects ever cross into JavaScript.

export const readTotals = (): { count: number; totalMinor: Minor } => {
  const rows = all<{ n: number; total: number | null }>(
    `SELECT COUNT(*) AS n, SUM(amount_minor) AS total
       FROM expenses`,
  );
  // This query always returns exactly one row, even on an empty table.
  // The fallback is belt-and-braces so TypeScript stays happy.

  const row = rows[0] ?? { n: 0, total: null };
  return {
    count: row.n,
    // SUM over an empty table is NULL, not 0.
    // And a sum is arithmetic, so it re-enters through asMinor —
    // the same rule as Minor + Minor giving back a plain number.
    totalMinor: asMinor(row.total ?? 0),
  };
};

export const insertExpense = (
  title: string,
  amountMinor: Minor,
  currencyCode: string,
): Expense => {
  const expense: Expense = {
    // TODO(Milestone 7): must become a real UUID once a second device
    // can also create expenses. Fine while there's exactly one source of IDs.
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    currencyCode,
    amountMinor,
    createdAt: Date.now(),
  };

  run(
    // category_id is passed EXPLICITLY rather than left to fall to NULL.
    //
    // The column is nullable with no default — SQLite forced that, because
    // an added column carrying REFERENCES cannot have a non-NULL default.
    // So omitting it here would work, and would quietly produce a database
    // where the 50,013 migrated rows say 'uncategorised' and every row
    // added afterwards says NULL. Two spellings of the same idea, neither
    // wrong, both present, discovered in 5e as a confusing bug.
    //
    // Same rule as currency_code: the DEFAULT is a safety net for legacy
    // rows, not a feature. Inserts say what they mean.
    `INSERT INTO expenses (id, title, amount_minor, currency_code, created_at, category_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      expense.id,
      expense.title,
      expense.amountMinor,
      expense.currencyCode,
      expense.createdAt,
      UNCATEGORISED_ID,
    ],
  );

  return expense;
};
export const debugAmountTypes = () => {
  const rows = all<{
    id: string;
    title: string;
    amount_minor: number;
    t: string;
    currency_code: string;
  }>(
    `SELECT id, title, amount_minor, typeof(amount_minor) AS t, currency_code
       FROM expenses
      ORDER BY created_at DESC, id DESC
      LIMIT 20`,
  );
  console.log(JSON.stringify(rows, null, 2));
};

// DEV ONLY. IF NOT EXISTS makes it safe to tap twice — nothing visible
// happens when it works, so you will.
export const createListIndex = (): void => {
  const t0 = Date.now();
  run(
    // The column order matches the ORDER BY exactly: created_at first,
    // id as the tiebreaker. An index only helps a sort it lines up with.
    `CREATE INDEX IF NOT EXISTS idx_expenses_created_at_id
       ON expenses (created_at DESC, id DESC)`,
  );
  // Building over 50,013 rows is not instant. Worth seeing the number.
  console.log(`create index: ${Date.now() - t0}ms`);
};

// DEV ONLY. Safe because an index holds no data of its own — every
// value in it is a copy of something still sitting in the table.
export const dropListIndex = (): void => {
  run(`DROP INDEX IF EXISTS idx_expenses_created_at_id`);
  console.log("index dropped");
};

// DEV ONLY. Prints the whole row, not a field. The column name a PRAGMA
// hands back is not something to assert from memory — that is the same
// lesson the plan output taught, and it cost nothing to apply here.
export const readUserVersion = (): void => {
  const rows = all<Record<string, unknown>>(`PRAGMA user_version`);
  console.log(`user_version -> ${JSON.stringify(rows)}`);
};

// ─── Dev only. Milestone 5d, verification. ────────────────────────────────
// Run this AFTER migration 4 has landed. Three questions, and all three are
// needed — each one is blind to something the others catch.
export const verifyMigration4 = (): void => {
  // Q1. Does the foreign key actually exist?
  // PRAGMA table_info would NOT answer this. It lists columns, and foreign
  // keys are not columns — they are stored separately. This is the only
  // statement that can tell a real constraint from a comment in the schema.
  console.log(
    "foreign_key_list(expenses) ->",
    JSON.stringify(all<Record<string, unknown>>("PRAGMA foreign_key_list(expenses)"), null, 2),
  );

  // Q2. Does any row point at a category that does not exist?
  // The full stocktake. Reads every one of the 50,013 rows. Zero rows back
  // means clean — blank output IS the answer here.
  const violations = all<Record<string, unknown>>("PRAGMA foreign_key_check");
  console.log("foreign_key_check -> violations:", violations.length, JSON.stringify(violations));

  // Q3. Did the backfill actually run?
  // Q2 CANNOT answer this. A NULL foreign key means "no relationship", which
  // is always valid, so foreign_key_check passes a table of 50,013 NULLs
  // without a murmur. This is the question that catches a silent no-op.
  console.log(
    "rows with NULL category_id ->",
    JSON.stringify(
      all<Record<string, unknown>>("SELECT COUNT(*) AS n FROM expenses WHERE category_id IS NULL"),
    ),
  );
    // Q4. What did the newest rows actually get?
  // n=0 above is equally true if insertExpense works and if no expense was
  // added at all. This separates them: a UI row's id is a bare timestamp,
  // a seeded row's id starts with "seed-".
  console.log(
    "newest 3 rows ->",
    JSON.stringify(
      all<Record<string, unknown>>(
        `SELECT id, title, category_id
           FROM expenses
          ORDER BY created_at DESC, id DESC
          LIMIT 3`,
      ),
      null,
      2,
    ),
  );
};



// ─── Dev only. Milestone 5d, step 0. ──────────────────────────────────────
// Asks the database the four questions migration 4's shape depends on.
// Each one is a fact we would otherwise be guessing at.
export const probeForeignKeys = (): void => {
  // Typed as an unknown record on purpose. Printing the whole row tells us the
  // real column name instead of us asserting one and being wrong quietly.
  const readFk = (label: string): void => {
    const rows = all<Record<string, unknown>>("PRAGMA foreign_keys");
    // JSON.stringify because React Native's console collapses nested objects
    // to [Object] and we would learn nothing.
    console.log(`fk ${label} ->`, JSON.stringify(rows));
  };

  console.log(
    "sqlite_version ->",
    JSON.stringify(all<Record<string, unknown>>("SELECT sqlite_version() AS v")),
  );

  // Q1. Does expo-sqlite hand us a connection with enforcement already on?
  readFk("at open");

  // Q2. Can we turn it on outside a transaction, and does the read agree?
  // A PRAGMA write returns nothing, so it goes through run(), not all().
  run("PRAGMA foreign_keys = ON");
  readFk("after ON, outside tx");

  // Q3. The question that decides where enforcement has to live.
  // Turn it off first, so a reading of 1 inside the tx means the pragma
  // actually did something rather than that it was already on.
  run("PRAGMA foreign_keys = OFF");
  readFk("after OFF, outside tx");
  try {
    tx(() => {
      run("PRAGMA foreign_keys = ON");
      const rows = all<Record<string, unknown>>("PRAGMA foreign_keys");
      console.log("fk INSIDE tx ->", JSON.stringify(rows));
    });
  } catch (err) {
    // Not an empty catch. If run() throws inside tx(), tx() rolls back and
    // rethrows, and an unhandled throw here would silently skip Q4.
    // "It threw" is a different answer from "it no-opped" and we want both.
    console.log("fk INSIDE tx THREW ->", String(err));
  }
  readFk("after the tx closed");

  // Q4. The real schema, read from the database instead of from a handoff file.
  console.log(
    "table_info(expenses) ->",
    JSON.stringify(all<Record<string, unknown>>("PRAGMA table_info(expenses)"), null, 2),
  );

  // Leave the connection in a known state. Safe to do unconditionally: this
  // pragma is per connection and is never written to the database file, so a
  // relaunch resets it regardless. That is why this is not a foot-gun the
  // way rewindMigration3 is.
  run("PRAGMA foreign_keys = ON");
  readFk("restored at end");
};



const SEED_PREFIX = "seed-";

// Title and category are paired here rather than cycled independently.
// i % length over both arrays gave "Rickshaw" in Health — data that is
// unreadable to browse and useless as a filter test.
//
// The category ids are validated against the database below. They are
// not trusted just because they are written here.
const FAKE_EXPENSES: ReadonlyArray<{ title: string; categoryId: string }> = [
  { title: "Tea",            categoryId: "food" },
  { title: "Rickshaw",       categoryId: "transport" },
  { title: "Lunch",          categoryId: "food" },
  { title: "Groceries",      categoryId: "food" },
  { title: "Phone recharge", categoryId: "bills" },
  { title: "Bus fare",       categoryId: "transport" },
  { title: "Snacks",         categoryId: "food" },
  { title: "Photocopy",      categoryId: "study" },
  { title: "Internet bill",  categoryId: "bills" },
  { title: "Medicine",       categoryId: "health" },
];

// DEV ONLY. Note this does NOT reuse insertExpense — that function
// owns the timestamp (Date.now()), and we need dates spread across a
// year so the list isn't 5,000 rows from the same second.

export const seedFakeExpenses = (count: number): void => {
  const now = Date.now();
  const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

  // Read the real category list, from the database, ONCE, before the loop.
    // The database still decides which ids are real. The difference is that
  // it now CHECKS the map instead of supplying it. A seeder that cannot
  // fail is worse than one that throws — a silently-skipped migration 5
  // would only show up in 5g as a measurement that means nothing.
  const known = new Set(
    all<{ id: string }>(`SELECT id FROM categories`).map((r) => r.id),
  );
  const missing = [...new Set(FAKE_EXPENSES.map((f) => f.categoryId))].filter(
    (id) => !known.has(id),
  );
  if (missing.length > 0) {
    throw new Error(
      `seedFakeExpenses: these categories are not in the database: ${missing.join(", ")}. Has migration 5 run? Check user_version.`,
    );
  }

  console.log(`STARTING SEED 💫 ${count} rows across ${known.size} categories`);

  tx(() => {
    for (let i = 0; i < count; i++) {
            // One lookup instead of two. Title and category can no longer drift.
      const fake = FAKE_EXPENSES[i % FAKE_EXPENSES.length];
      // 20 to 2000 taka, converted to paisa. asMinor proves it's whole,
      // so the seeder cannot inject the float bug we fixed at 4a.
      const amountMinor = asMinor(Math.round(20 + Math.random() * 1980) * 100);

      run(
        `INSERT INTO expenses (id, title, amount_minor, currency_code, created_at, category_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          `${SEED_PREFIX}${i}-${now}`,
          fake.title,
          amountMinor,
          DEFAULT_CURRENCY,
          now - Math.floor(Math.random() * YEAR_MS),
          fake.categoryId,
        ],
      );
    }
  });
};


export const clearSeedExpenses = (): void => {
  const t0 = Date.now();
  run(`DELETE FROM expenses WHERE id LIKE '${SEED_PREFIX}%'`);
  console.log(`clear: ${Date.now() - t0}ms`);
};

// DEV ONLY. Milestone 5e, step 0. Read-only.
//
// clearSeedExpenses deletes by id prefix. Before we clear ~100,000 rows,
// this asks what that prefix actually catches and what it leaves behind.
// Every count of the surviving set so far came from a handoff file rather
// than from a query, and the arithmetic does not close.
export const countRowSources = (): void => {
  // CASE turns a per-row test into a label, and GROUP BY counts each label.
  // One pass over the table rather than two separate COUNT(*) queries.
  console.log(
    "row sources ->",
    JSON.stringify(
      all<Record<string, unknown>>(
        `SELECT CASE WHEN id LIKE '${SEED_PREFIX}%' THEN 'seeded' ELSE 'kept' END AS bucket,
                COUNT(*) AS n
           FROM expenses
          GROUP BY bucket`,
      ),
    ),
  );

  // The kept rows are the ones a clear will NOT remove, so we look at them
  // instead of trusting a count of them. LIMIT 50 because if the count above
  // is large the hypothesis is already dead and a flood adds nothing.
  console.log(
    "kept rows ->",
    JSON.stringify(
      all<Record<string, unknown>>(
        `SELECT id, title, category_id
           FROM expenses
          WHERE id NOT LIKE '${SEED_PREFIX}%'
          ORDER BY created_at DESC, id DESC
          LIMIT 50`,
      ),
      null,
      2,
    ),
  );

  // The spread as it stands. This is the "before" half of a pair — one row
  // back means one category, which is the state 5f and 5g cannot measure in.
  console.log(
    "by category ->",
    JSON.stringify(
      all<Record<string, unknown>>(
        `SELECT category_id, COUNT(*) AS n
           FROM expenses
          GROUP BY category_id
          ORDER BY n DESC`,
      ),
    ),
  );
};




// DEV ONLY. Times page one against the deepest page in the table.
// The page size is held constant at both offsets, so the only thing
// that differs is how far into the sort SQLite has to reach.
export const timePages = (): void => {
  const { count } = readTotals();

  // Read the real count instead of hardcoding an offset. A hardcoded
  // number falls past the end of a smaller table, returns zero rows,
  // and times as "fast" while measuring nothing.
  const deep = Math.max(0, count - PAGE_SIZE);

  const time = (label: string, offset: number) => {
    const t0 = Date.now();
    const rows = listExpensePage(offset);
    console.log(
      `${label} | offset ${offset} | ${rows.length} rows | ${Date.now() - t0}ms`,
    );
  };

  console.log(`--- timing: ${count} rows, page size ${PAGE_SIZE} ---`);

  // Each offset runs twice. Every number in this project so far has been
  // a single reading, and single readings are what let a wrong sort cost
  // survive two sessions. A second pass exposes warm-up effects.
  time("page one ", 0);
  time("deep page", deep);
  time("page one ", 0);
  time("deep page", deep);
};


