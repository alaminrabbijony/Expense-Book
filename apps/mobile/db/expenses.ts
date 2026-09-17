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

const LIST_PAGE_HEAD = `SELECT id, title, amount_minor, currency_code, created_at
       FROM expenses`;

const LIST_PAGE_TAIL = `ORDER BY created_at DESC, id DESC`;

// Unfiltered. Character for character the same query as before 5f, so the
// numbers 5b measured still describe this string.
const LIST_PAGE_SELECT = `${LIST_PAGE_HEAD}
      ${LIST_PAGE_TAIL}`;

// Filtered. Two separate strings, not one string carrying
// "WHERE (? IS NULL OR category_id = ?)".
//
// That clever single-string version was measured in Session 10 and SQLite
// answered it with a full SCAN even with an index present. The planner has
// to evaluate that test row by row, so it cannot reach for an index. 5g's
// entire measurement depends on this string being able to.
//
// This text is now FINAL. 5g runs it before and after creating the index,
// and that comparison only means something if the text does not move.
const LIST_PAGE_SELECT_FILTERED = `${LIST_PAGE_HEAD}
      WHERE category_id = ?
      ${LIST_PAGE_TAIL}`;

export const listExpensePage = (
  offset: number,
  categoryId?: string,
): Expense[] => {
  // Two calls rather than building one array conditionally. The parameter
  // ORDER differs between the two branches, and that is exactly the kind of
  // thing a shared array quietly gets wrong.
  const rows = categoryId
    ? all<ExpenseRow>(`${LIST_PAGE_SELECT_FILTERED} LIMIT ? OFFSET ?`, [
        categoryId,
        PAGE_SIZE,
        offset,
      ])
    : all<ExpenseRow>(`${LIST_PAGE_SELECT} LIMIT ? OFFSET ?`, [
        PAGE_SIZE,
        offset,
      ]);
  return rows.map(toExpense);
};

export const insertExpense = (
  title: string,
  amountMinor: Minor,
  currencyCode: string,
  // Optional, and the default is a real row rather than NULL.
  //
  // 'uncategorised' already means "not sorted yet", so there is nothing
  // NULL would express that this does not. Keeping the column nullable-but-
  // never-null also avoids wanting NOT NULL, which SQLite cannot add to an
  // existing column without rebuilding the table — and a rebuild would drop
  // and recreate the two indexes 5g measured.
  categoryId: string = UNCATEGORISED_ID,
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
    // So omitting it would work, and would quietly produce a database where
    // the migrated rows say 'uncategorised' and every row added afterwards
    // says NULL. Two spellings of the same idea, both present, discovered
    // in 5e as a confusing bug.
    //
    // currencyCode and categoryId are both strings and they are adjacent.
    // Swapping them compiles. The foreign key on category_id is the only
    // thing that catches it, which is why 5h verified it before touching
    // this function.
    `INSERT INTO expenses (id, title, amount_minor, currency_code, created_at, category_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      expense.id,
      expense.title,
      expense.amountMinor,
      expense.currencyCode,
      expense.createdAt,
      categoryId,
    ],
  );

  return expense;
};
// DEV ONLY. Asks SQLite how it INTENDS to answer the paging query.
// EXPLAIN QUERY PLAN never executes the query, so this costs the same
// at 50,000 rows as at 50.
export const explainListPage = (): void => {
  // Widened from number[] — the filtered query binds a string first.
  const show = (label: string, sql: string, params?: (string | number)[]) => {
    try {
      const rows = all<Record<string, unknown>>(sql, params);
      console.log(`--- plan (${label}) ---\n${JSON.stringify(rows, null, 2)}`);
    } catch (err) {
      console.log(`--- plan (${label}) FAILED ---`, String(err));
    }
  };

  show("literal", `EXPLAIN QUERY PLAN ${LIST_PAGE_SELECT} LIMIT ${PAGE_SIZE} OFFSET 0`);

  show("bound", `EXPLAIN QUERY PLAN ${LIST_PAGE_SELECT} LIMIT ? OFFSET ?`, [
    PAGE_SIZE,
    0,
  ]);

  // The 5f query, planned today with no index on category_id. Expect SCAN.
  // That reading is half of a pair — 5g creates the index and runs this
  // same function again. Taking it now means the "before" cannot be blamed
  // on the SQL having changed in between.
  show(
    "bound + category filter",
    `EXPLAIN QUERY PLAN ${LIST_PAGE_SELECT_FILTERED} LIMIT ? OFFSET ?`,
    ["food", PAGE_SIZE, 0],
  );
};

// COUNT and SUM are "aggregate" functions — they squash many rows
// into one value. SQLite does the work internally, so no rows and
// no objects ever cross into JavaScript.

export const readTotals = (
  categoryId?: string,
): { count: number; totalMinor: Minor } => {
  // This total MUST narrow with the filter. It is the number at the top of
  // the screen and it is the reason 5f exists — a list showing only Food
  // above a total showing everything is a screen that lies quietly.
  const rows = categoryId
    ? all<{ n: number; total: number | null }>(
        `SELECT COUNT(*) AS n, SUM(amount_minor) AS total
           FROM expenses
          WHERE category_id = ?`,
        [categoryId],
      )
    : all<{ n: number; total: number | null }>(
        `SELECT COUNT(*) AS n, SUM(amount_minor) AS total
       FROM expenses`,
      );

  // COUNT(*) is correct here. There is no join, so no NULL-filled row can
  // appear — the empty result is genuinely zero rows, not one blank one.\

  const row = rows[0] ?? { n: 0, total: null };
  return {
    count: row.n,
    // Filtering to rent hits this path for real: 0 rows, so SUM is NULL.
    totalMinor: asMinor(row.total ?? 0),
  };
};

export type CategoryBreakdown = {
  id: string;
  name: string;
  count: number;
  totalMinor: Minor;
};

// Every category, with how many expenses are in it and how much money.
//
// Reads FROM categories and joins expenses onto it, rather than the other
// way round. GROUP BY over expenses alone returns no row at all for rent,
// because there is nothing there to group — 5e proved that. The sheet has
// to show rent, so categories has to be the table being read.
//
// This query takes NO filter, and that is deliberate, not an omission.
// Its job is to show you what you could switch to. Filtering it to the
// current category would show that category and six zeroes.
export const readCategoryBreakdown = (): CategoryBreakdown[] => {
  const rows = all<{
    id: string;
    name: string;
    n: number;
    total: number | null;
  }>(
    // COUNT(e.id), NOT COUNT(*).
    //
    // The LEFT JOIN still produces one row for rent, with every e.* column
    // NULL. COUNT(*) counts rows and would report 1. COUNT(e.id) counts
    // non-NULL values and reports 0. Nothing throws either way, so this is
    // a wrong number on screen rather than a crash.
    `SELECT c.id                AS id,
            c.name              AS name,
            COUNT(e.id)         AS n,
            SUM(e.amount_minor) AS total
       FROM categories c
       LEFT JOIN expenses e ON e.category_id = c.id
      GROUP BY c.id, c.name
      ORDER BY total DESC, c.id ASC`,
    // ORDER BY total DESC puts the biggest spend first. SQLite sorts NULL
    // below everything, so rent lands at the bottom on its own. c.id is the
    // tiebreaker — two categories with equal totals must not swap places
    // between reads.
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    count: r.n,
    // SUM over zero rows is NULL. Same rule as readTotals.
    totalMinor: asMinor(r.total ?? 0),
  }));
};


export type Category = { id: string; name: string };

// The picker's read. No join, no aggregate, seven rows.
//
// This is NOT readCategoryBreakdown with the numbers ignored. That query
// LEFT JOINs 50,022 expense rows to produce these same seven names, and it
// orders by total DESC — correct for a report, wrong for a picker, because
// the rows would move as spending changes.
//
// ORDER BY name is here for stability, not for looks. A picker whose rows
// reorder between opens defeats muscle memory.
//
// Returns every category including 'uncategorised'. Whether a surface shows
// that row is the surface's decision, not this query's.
export const readCategories = (): Category[] =>
  all<Category>(`SELECT id, name FROM categories ORDER BY name ASC`);


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
    JSON.stringify(
      all<Record<string, unknown>>("PRAGMA foreign_key_list(expenses)"),
      null,
      2,
    ),
  );

  // Q2. Does any row point at a category that does not exist?
  // The full stocktake. Reads every one of the 50,013 rows. Zero rows back
  // means clean — blank output IS the answer here.
  const violations = all<Record<string, unknown>>("PRAGMA foreign_key_check");
  console.log(
    "foreign_key_check -> violations:",
    violations.length,
    JSON.stringify(violations),
  );

  // Q3. Did the backfill actually run?
  // Q2 CANNOT answer this. A NULL foreign key means "no relationship", which
  // is always valid, so foreign_key_check passes a table of 50,013 NULLs
  // without a murmur. This is the question that catches a silent no-op.
  console.log(
    "rows with NULL category_id ->",
    JSON.stringify(
      all<Record<string, unknown>>(
        "SELECT COUNT(*) AS n FROM expenses WHERE category_id IS NULL",
      ),
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
    JSON.stringify(
      all<Record<string, unknown>>("SELECT sqlite_version() AS v"),
    ),
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
    JSON.stringify(
      all<Record<string, unknown>>("PRAGMA table_info(expenses)"),
      null,
      2,
    ),
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
  { title: "Tea", categoryId: "food" },
  { title: "Rickshaw", categoryId: "transport" },
  { title: "Lunch", categoryId: "food" },
  { title: "Groceries", categoryId: "food" },
  { title: "Phone recharge", categoryId: "bills" },
  { title: "Bus fare", categoryId: "transport" },
  { title: "Snacks", categoryId: "food" },
  { title: "Photocopy", categoryId: "study" },
  { title: "Internet bill", categoryId: "bills" },
  { title: "Medicine", categoryId: "health" },
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


// ─── Dev only. Milestone 5g. ──────────────────────────────────────────────
//
// Every candidate is created and dropped from a button rather than a
// migration. 5g has to visit three index states and go back, and a
// migration only goes forward. The winner earns a migration in a later
// session; the losers never reach the schema at all.

const IDX_CATEGORY = "idx_expenses_category_id";
const IDX_CATEGORY_SORT = "idx_expenses_category_created_at_id";


// Four categories, spanning the distribution deliberately. rent and food
// are the two ends and neither is optional — a reading taken from one of
// them alone supports two opposite conclusions depending on which you took.
const TIMED_CATEGORIES = ["rent", "uncategorised", "health", "food"] as const;

// DEV ONLY. Which indexes exist RIGHT NOW, read from the database.
//
// This is the only thing that can tell the three states apart. The timings
// cannot: a slow number looks identical whether the index is genuinely
// absent or whether you tapped create and something went wrong quietly.
//
// sqlite_master is SQLite's own catalogue of what is in the file. One row
// per table, index, view and trigger.

export const listIndexes = (): void => {
  console.log(
    "indexes on expenses ->",
    JSON.stringify(
      all<Record<string, unknown>>(
        `SELECT name, sql
           FROM sqlite_master
          WHERE type = 'index' AND tbl_name = 'expenses'
          ORDER BY name`,
      ),
      null,
      2,
    ),
  );
};
// DEV ONLY. Candidate 1. Filter only.
export const createCategoryIndex = (): void => {
  const t0 = Date.now();
  run(`CREATE INDEX IF NOT EXISTS ${IDX_CATEGORY} ON expenses (category_id)`);
  // Build time is itself a result. A bigger index costs more here, and that
  // cost is paid again on every insert for the life of the app.
  console.log(`create ${IDX_CATEGORY}: ${Date.now() - t0}ms`);
};


// DEV ONLY. Candidate 2. Filter and sort in one index.
export const createCategoryCompositeIndex = (): void => {
  const t0 = Date.now();
  run(
    // category_id FIRST, and that is not a style choice. An index is sorted
    // left to right, so leading with category_id puts every food row in one
    // contiguous block, and created_at is still descending INSIDE that
    // block. Lead with created_at instead and the food rows scatter across
    // the whole index — the sort survives, the filter does not.
    `CREATE INDEX IF NOT EXISTS ${IDX_CATEGORY_SORT}
       ON expenses (category_id, created_at DESC, id DESC)`,
  );
  console.log(`create ${IDX_CATEGORY_SORT}: ${Date.now() - t0}ms`);
};

// DEV ONLY. Drops both candidates and nothing else.
//
// idx_expenses_created_at_id is deliberately NOT dropped here. It serves
// the unfiltered list, it is the "before" state every filtered number is
// compared against, and removing it would change what those numbers mean.
export const dropCategoryIndexes = (): void => {
  run(`DROP INDEX IF EXISTS ${IDX_CATEGORY}`);
  run(`DROP INDEX IF EXISTS ${IDX_CATEGORY_SORT}`);
  console.log("category index candidates dropped");
};


// DEV ONLY. The filtered plan, asked twice with different values bound.
//
// Identical SQL text both times. LIST_PAGE_SELECT_FILTERED is not touched;
// only the bound parameter differs. If the two plans come back the same,
// that is the planner saying it cannot tell 0 rows from 20,000 rows —
// which it cannot, because ANALYZE has never run on this database.
export const explainFilteredPlans = (): void => {
  const show = (categoryId: string) => {
    const rows = all<Record<string, unknown>>(
      `EXPLAIN QUERY PLAN ${LIST_PAGE_SELECT_FILTERED} LIMIT ? OFFSET ?`,
      [categoryId, PAGE_SIZE, 0],
    );
    console.log(
      `--- filtered plan (${categoryId}) ---\n${JSON.stringify(rows, null, 2)}`,
    );
  };

  show("food");
  show("rent");
};


// DEV ONLY. Times the filtered page query across the distribution.
export const timeFilteredPages = (): void => {
  // Every count is read FIRST, before any timing runs.
  //
  // readTotals(id) touches exactly the rows the timed query is about to
  // touch, so calling it immediately before a timing hands that timing a
  // warm page cache. Worse, it warms by a different amount in each index
  // state — which is the comparison this milestone exists to make. Doing
  // all the counts up front puts the same distance between the warming
  // read and every timed read.
  const plan = TIMED_CATEGORIES.map((id) => {
    const { count } = readTotals(id);
    return { id, count, deep: Math.max(0, count - PAGE_SIZE) };
  });

  console.log(`--- filtered timing, page size ${PAGE_SIZE} ---`);

  for (const { id, count, deep } of plan) {
    const time = (label: string, offset: number) => {
      const t0 = Date.now();
      const rows = listExpensePage(offset, id);
      console.log(
        `${id.padEnd(14)}| ${label} | offset ${String(offset).padStart(5)} | ${String(rows.length).padStart(2)} rows | ${Date.now() - t0}ms`,
      );
    };

    // rent and uncategorised both have fewer rows than one page, so their
    // deep offset is 0 and the two labels below time the SAME query. Four
    // readings of one thing, not two readings of two things.
    console.log(`${id}: ${count} rows`);
    time("page one ", 0);
    time("deep page", deep);
    time("page one ", 0);
    time("deep page", deep);
  }
};


// ─── Dev only. Milestone 5h. ──────────────────────────────────────────────

// Does the foreign key actually stop a dangling category_id on INSERT?
//
// probeForeignKeys answers "is the pragma on". This answers "does it bite",
// which is a different question — enforcement being on does not by itself
// prove this table's constraint is real.
//
// Nothing survives this function. The insert runs inside a transaction that
// is thrown out on purpose, and the row is then counted and deleted by hand
// rather than trusting the rollback to have happened.
export const probeCategoryFkOnInsert = (): void => {
  const probeId = `fkprobe-${Date.now()}`;
  let accepted = false;

  try {
    tx(() => {
      run(
        `INSERT INTO expenses (id, title, amount_minor, currency_code, created_at, category_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [probeId, "FK probe", 1, DEFAULT_CURRENCY, Date.now(), "__no_such_category__"],
      );
      // Reaching this line IS the answer: the insert was accepted, which
      // means nothing is enforcing the constraint. Set the flag first, then
      // throw to unwind the transaction.
      accepted = true;
      throw new Error("rollback: probe only");
    });
  } catch (err) {
    // Two different throws land here and they mean opposite things. The
    // `accepted` flag tells them apart, not the message.
    console.log("probe threw ->", String(err));
  }

  // Do not trust the rollback. Ask. This also makes the function safe if
  // tx() turns out not to rethrow.
  const left = all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM expenses WHERE id = ?`,
    [probeId],
  );
  if ((left[0]?.n ?? 0) > 0) {
    run(`DELETE FROM expenses WHERE id = ?`, [probeId]);
    console.log("probe row SURVIVED the rollback and was deleted by hand");
  }

  console.log(
    accepted
      ? "FK NOT ENFORCED — a dangling category_id was accepted"
      : "FK ENFORCED — the insert was rejected",
  );
};

// How much does the picker save by not reusing the breakdown?
// Each read runs twice and only the second is comparable — same rule as
// timePages, for the same reason.
export const timeCategoryReads = (): void => {
  const time = (label: string, fn: () => unknown) => {
    const t0 = Date.now();
    const out = fn();
    const ms = Date.now() - t0;
    const n = Array.isArray(out) ? out.length : 0;
    console.log(`${label.padEnd(10)}| ${n} rows | ${ms}ms`);
  };

  console.log("--- category reads ---");
  time("breakdown", readCategoryBreakdown);
  time("lookup", readCategories);
  time("breakdown", readCategoryBreakdown);
  time("lookup", readCategories);
};