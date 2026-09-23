/**
 * Dev-only tooling for the expenses database.
 *
 * Nothing in this file is called by the shipped app. Every function here is
 * wired to a button that only renders behind __DEV__, or is meant to be run
 * from a debugger.
 *
 * It lives apart from db/expenses.ts so that file stays readable: the
 * production data layer is the queries the app actually runs, and this is
 * everything used to prove they work.
 *
 * Importing this module does not make it run. It does, however, keep it in
 * the bundle — splitting the file is an organisation win, not a size one.
 */
import { asMinor, DEFAULT_CURRENCY } from "@et/shared";
import { all, run, tx } from ".";
import {
  insertCategory,
  insertExpense,
  listExpensePage,
  LIST_PAGE_SELECT,
  LIST_PAGE_SELECT_FILTERED,
  PAGE_SIZE,
  readCategories,
  readCategoryBreakdown,
  readExpenseForEdit,
  readTotals,
  renameCategory,
  deleteCategory,
  UNCATEGORISED_ID,
  updateExpense,
  restoreExpense,
  deleteExpense,
} from "./expenses";

/* ─── Query plans ──────────────────────────────────────────────────────── */

/**
 * Asks SQLite how it INTENDS to answer the paging query.
 *
 * EXPLAIN QUERY PLAN never executes the query, so this costs the same at
 * 50,000 rows as at 50. Look for SCAN versus SEARCH in the output — SCAN
 * means it is reading the whole table.
 *
 * KNOWN ISSUE: the third call binds the literal category id 'food', which no
 * longer exists in the table. It still returns a plan, because the planner
 * does not look at the data, but it is a lie waiting to be believed.
 */
export const explainListPage = (): void => {
  const show = (label: string, sql: string, params?: (string | number)[]) => {
    try {
      const rows = all<Record<string, unknown>>(sql, params);
      console.log(`--- plan (${label}) ---\n${JSON.stringify(rows, null, 2)}`);
    } catch (err) {
      console.log(`--- plan (${label}) FAILED ---`, String(err));
    }
  };

  show(
    "literal",
    `EXPLAIN QUERY PLAN ${LIST_PAGE_SELECT} LIMIT ${PAGE_SIZE} OFFSET 0`,
  );

  show("bound", `EXPLAIN QUERY PLAN ${LIST_PAGE_SELECT} LIMIT ? OFFSET ?`, [
    PAGE_SIZE,
    0,
  ]);

  show(
    "bound + category filter",
    `EXPLAIN QUERY PLAN ${LIST_PAGE_SELECT_FILTERED} LIMIT ? OFFSET ?`,
    ["food", PAGE_SIZE, 0],
  );
};

/**
 * The filtered plan, asked twice with different values bound.
 *
 * Identical SQL text both times; only the bound parameter differs. If the two
 * plans come back the same, that is the planner saying it cannot tell an
 * empty category from a huge one — which it cannot, because ANALYZE has never
 * been run on this database.
 *
 * KNOWN ISSUE: 'food' no longer exists as a category id.
 */
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

/* ─── Timing ───────────────────────────────────────────────────────────── */

/**
 * Times page one against the deepest page in the table.
 *
 * The page size is held constant at both offsets, so the only thing that
 * differs is how far into the sort SQLite has to reach.
 *
 * Each offset runs twice. A single reading cannot tell a real cost from a
 * cold cache, and a second pass exposes warm-up effects.
 */
export const timePages = (): void => {
  const { count } = readTotals();

  /* Read the real count instead of hardcoding an offset. A hardcoded number
   * falls past the end of a smaller table, returns zero rows, and times as
   * "fast" while measuring nothing. */
  const deep = Math.max(0, count - PAGE_SIZE);

  const time = (label: string, offset: number) => {
    const t0 = Date.now();
    const rows = listExpensePage(offset);
    console.log(
      `${label} | offset ${offset} | ${rows.length} rows | ${Date.now() - t0}ms`,
    );
  };

  console.log(`--- timing: ${count} rows, page size ${PAGE_SIZE} ---`);

  time("page one ", 0);
  time("deep page", deep);
  time("page one ", 0);
  time("deep page", deep);
};

/*
 * Categories to time across, chosen to span the distribution. The two ends
 * are both needed — a reading taken from one alone supports two opposite
 * conclusions depending on which you took.
 *
 * KNOWN ISSUE: 'food' is not in the table any more. Nothing validates this
 * list, so that entry silently times a query over zero rows.
 */
const TIMED_CATEGORIES = ["rent", "uncategorised", "health", "food"] as const;

/**
 * Times the filtered page query across the distribution.
 *
 * Every count is read FIRST, before any timing runs. readTotals(id) touches
 * exactly the rows the timed query is about to touch, so calling it
 * immediately before a timing hands that timing a warm page cache — and warms
 * it by a different amount in each index state, which is the comparison this
 * is for. Doing all the counts up front puts the same distance between the
 * warming read and every timed read.
 */
export const timeFilteredPages = (): void => {
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
        `${id.padEnd(14)}| ${label} | offset ${String(offset).padStart(
          5,
        )} | ${String(rows.length).padStart(2)} rows | ${Date.now() - t0}ms`,
      );
    };

    /* A category with fewer rows than one page has a deep offset of 0, so the
     * two labels below time the SAME query — four readings of one thing, not
     * two readings of two things. */
    console.log(`${id}: ${count} rows`);
    time("page one ", 0);
    time("deep page", deep);
    time("page one ", 0);
    time("deep page", deep);
  }
};

/**
 * How much does a name-only category read save over the full breakdown?
 *
 * Each read runs twice and only the second is comparable, same rule as
 * timePages and for the same reason.
 */
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

/* ─── Indexes ──────────────────────────────────────────────────────────── */

const IDX_CATEGORY = "idx_expenses_category_id";
const IDX_CATEGORY_SORT = "idx_expenses_category_created_at_id";

/**
 * Which indexes exist on `expenses` RIGHT NOW, read from the database.
 *
 * This is the only thing that can tell the index states apart. Timings
 * cannot: a slow number looks identical whether an index is genuinely absent
 * or whether you tapped create and something went wrong quietly.
 *
 * sqlite_master is SQLite's own catalogue of what is in the file — one row
 * per table, index, view and trigger.
 */
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

/**
 * The index serving the unfiltered list.
 *
 * IF NOT EXISTS makes it safe to tap twice — nothing visible happens when it
 * works, so you will.
 */
export const createListIndex = (): void => {
  const t0 = Date.now();
  run(
    /* The column order matches the list's ORDER BY exactly: created_at first,
     * id as the tiebreaker. An index only helps a sort it lines up with. */
    `CREATE INDEX IF NOT EXISTS idx_expenses_created_at_id
       ON expenses (created_at DESC, id DESC)`,
  );
  /* Build time is itself a result. A bigger index costs more here, and that
   * cost is paid again on every insert for the life of the app. */
  console.log(`create index: ${Date.now() - t0}ms`);
};

/**
 * Drops the list index.
 *
 * Safe because an index holds no data of its own — every value in it is a
 * copy of something still sitting in the table.
 */
export const dropListIndex = (): void => {
  run(`DROP INDEX IF EXISTS idx_expenses_created_at_id`);
  console.log("index dropped");
};

/** Index candidate: filter only. */
export const createCategoryIndex = (): void => {
  const t0 = Date.now();
  run(`CREATE INDEX IF NOT EXISTS ${IDX_CATEGORY} ON expenses (category_id)`);
  console.log(`create ${IDX_CATEGORY}: ${Date.now() - t0}ms`);
};

/** Index candidate: filter and sort in one index. */
export const createCategoryCompositeIndex = (): void => {
  const t0 = Date.now();
  run(
    /*
     * category_id FIRST, and that is not a style choice. An index is sorted
     * left to right, so leading with category_id puts every row of one
     * category in a contiguous block, with created_at still descending INSIDE
     * that block. Lead with created_at instead and the category's rows
     * scatter across the whole index — the sort survives, the filter does
     * not.
     */
    `CREATE INDEX IF NOT EXISTS ${IDX_CATEGORY_SORT}
       ON expenses (category_id, created_at DESC, id DESC)`,
  );
  console.log(`create ${IDX_CATEGORY_SORT}: ${Date.now() - t0}ms`);
};

/**
 * Drops both category index candidates and nothing else.
 *
 * The created_at-only index is deliberately NOT dropped here. It serves the
 * unfiltered list, it is the baseline every filtered number is compared
 * against, and removing it would change what those numbers mean.
 */
export const dropCategoryIndexes = (): void => {
  run(`DROP INDEX IF EXISTS ${IDX_CATEGORY}`);
  run(`DROP INDEX IF EXISTS ${IDX_CATEGORY_SORT}`);
  console.log("category index candidates dropped");
};

/* ─── Schema and integrity probes ──────────────────────────────────────── */

/**
 * Prints the whole PRAGMA row, not a field.
 *
 * The column name a PRAGMA hands back is not something to assert from memory,
 * and printing the row costs nothing.
 */
export const readUserVersion = (): void => {
  const rows = all<Record<string, unknown>>(`PRAGMA user_version`);
  console.log(`user_version -> ${JSON.stringify(rows)}`);
};

/**
 * Asks the four questions the shape of the category foreign key depends on.
 *
 * Each one is a fact that would otherwise be a guess.
 */
export const probeForeignKeys = (): void => {
  /* Typed as an unknown record on purpose. Printing the whole row tells us
   * the real column name instead of asserting one and being wrong quietly. */
  const readFk = (label: string): void => {
    const rows = all<Record<string, unknown>>("PRAGMA foreign_keys");
    /* JSON.stringify because React Native's console collapses nested objects
     * to [Object] and we would learn nothing. */
    console.log(`fk ${label} ->`, JSON.stringify(rows));
  };

  console.log(
    "sqlite_version ->",
    JSON.stringify(
      all<Record<string, unknown>>("SELECT sqlite_version() AS v"),
    ),
  );

  /* Q1. Does the driver hand us a connection with enforcement already on? */
  readFk("at open");

  /* Q2. Can we turn it on outside a transaction, and does the read agree?
   * A PRAGMA write returns nothing, so it goes through run(), not all(). */
  run("PRAGMA foreign_keys = ON");
  readFk("after ON, outside tx");

  /* Q3. The question that decides where enforcement has to live. Turn it off
   * first, so a reading of 1 inside the tx means the pragma actually did
   * something rather than that it was already on. */
  run("PRAGMA foreign_keys = OFF");
  readFk("after OFF, outside tx");
  try {
    tx(() => {
      run("PRAGMA foreign_keys = ON");
      const rows = all<Record<string, unknown>>("PRAGMA foreign_keys");
      console.log("fk INSIDE tx ->", JSON.stringify(rows));
    });
  } catch (err) {
    /* Not an empty catch. If run() throws inside tx(), tx() rolls back and
     * rethrows, and an unhandled throw here would silently skip Q4. "It
     * threw" is a different answer from "it no-opped" and we want both. */
    console.log("fk INSIDE tx THREW ->", String(err));
  }
  readFk("after the tx closed");

  /* Q4. The real schema, read from the database rather than from a note. */
  console.log(
    "table_info(expenses) ->",
    JSON.stringify(
      all<Record<string, unknown>>("PRAGMA table_info(expenses)"),
      null,
      2,
    ),
  );

  /* Leave the connection in a known state. Safe to do unconditionally: this
   * pragma is per connection and is never written to the database file, so a
   * relaunch resets it regardless. */
  run("PRAGMA foreign_keys = ON");
  readFk("restored at end");
};

/**
 * Verifies that the category column, its foreign key and its backfill all
 * actually landed.
 *
 * Four questions, and all four are needed — each one is blind to something
 * the others catch.
 */
export const verifyMigration4 = (): void => {
  /* Q1. Does the foreign key actually exist? PRAGMA table_info would NOT
   * answer this. It lists columns, and foreign keys are not columns — they
   * are stored separately. This is the only statement that can tell a real
   * constraint from a comment in the schema. */
  console.log(
    "foreign_key_list(expenses) ->",
    JSON.stringify(
      all<Record<string, unknown>>("PRAGMA foreign_key_list(expenses)"),
      null,
      2,
    ),
  );

  /* Q2. Does any row point at a category that does not exist? The full
   * stocktake, reading every row. Zero rows back means clean — blank output
   * IS the answer here. */
  const violations = all<Record<string, unknown>>("PRAGMA foreign_key_check");
  console.log(
    "foreign_key_check -> violations:",
    violations.length,
    JSON.stringify(violations),
  );

  /* Q3. Did the backfill actually run? Q2 CANNOT answer this. A NULL foreign
   * key means "no relationship", which is always valid, so foreign_key_check
   * passes a table full of NULLs without a murmur. This is the question that
   * catches a silent no-op. */
  console.log(
    "rows with NULL category_id ->",
    JSON.stringify(
      all<Record<string, unknown>>(
        "SELECT COUNT(*) AS n FROM expenses WHERE category_id IS NULL",
      ),
    ),
  );

  /* Q4. What did the newest rows actually get? n=0 above is equally true if
   * the insert path works and if no expense was added at all. This separates
   * them: an id typed through the UI is a bare timestamp, a seeded one starts
   * with "seed-". */
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

/** Dumps the 20 newest rows with the STORED TYPE of each amount. */
export const debugAmountTypes = (): void => {
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

/* ─── Seeding ──────────────────────────────────────────────────────────── */

const SEED_PREFIX = "seed-";

/*
 * Title and category are paired here rather than cycled independently.
 * Cycling both by index put "Rickshaw" in Health — data that is unreadable to
 * browse and useless as a filter test.
 *
 * KNOWN ISSUE: 'food' and 'bills' are not in the categories table. The
 * validation in seedFakeExpenses catches this and throws, which is why the
 * seeder currently does not run. Fixing it means pointing these at ids that
 * exist, read from the database rather than typed here.
 */
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

/**
 * Fills the table with fake expenses spread across the past year.
 *
 * Does NOT reuse insertExpense, because that function owns the timestamp and
 * we need dates spread out rather than thousands of rows from one second.
 *
 * @throws If any category id in FAKE_EXPENSES is not in the database. A
 *   seeder that cannot fail is worse than one that throws — a silently
 *   skipped migration would turn up later as a measurement that means
 *   nothing.
 */
export const seedFakeExpenses = (count: number): void => {
  const now = Date.now();
  const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

  /* Read the real category list, from the database, ONCE, before the loop.
   * The database still decides which ids are real; the difference is that it
   * now CHECKS the list above instead of supplying it. */
  const known = new Set(
    all<{ id: string }>(`SELECT id FROM categories`).map((r) => r.id),
  );
  const missing = [...new Set(FAKE_EXPENSES.map((f) => f.categoryId))].filter(
    (id) => !known.has(id),
  );
  if (missing.length > 0) {
    throw new Error(
      `seedFakeExpenses: these categories are not in the database: ${missing.join(
        ", ",
      )}. Has the category migration run? Check user_version.`,
    );
  }

  console.log(`STARTING SEED 💫 ${count} rows across ${known.size} categories`);

  tx(() => {
    for (let i = 0; i < count; i++) {
      /* One lookup instead of two. Title and category cannot drift apart. */
      const fake = FAKE_EXPENSES[i % FAKE_EXPENSES.length];
      /* A plausible spend, converted to minor units. asMinor proves it is
       * whole, so the seeder cannot inject a fractional-minor-unit bug. */
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

/** Deletes every seeded row. Rows typed through the UI are left alone. */
export const clearSeedExpenses = (): void => {
  const t0 = Date.now();
  run(`DELETE FROM expenses WHERE id LIKE '${SEED_PREFIX}%'`);
  console.log(`clear: ${Date.now() - t0}ms`);
};

/**
 * Read-only. Asks where the rows in the table came from.
 *
 * clearSeedExpenses deletes by id prefix. Before clearing tens of thousands
 * of rows, this asks what that prefix actually catches and what it leaves
 * behind, instead of trusting a count written down somewhere.
 */
export const countRowSources = (): void => {
  /* CASE turns a per-row test into a label, and GROUP BY counts each label.
   * One pass over the table rather than two separate COUNT(*) queries. */
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

  /* The kept rows are the ones a clear will NOT remove, so look at them
   * instead of trusting a count of them. LIMIT 50 because if the count above
   * is large the hypothesis is already dead and a flood adds nothing. */
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

  /* The spread as it stands. One row back means one category, which is a
   * state no filter measurement can be taken in. */
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

/* ─── Write-path probes ────────────────────────────────────────────────── */

/**
 * Does the foreign key actually stop a dangling category_id on INSERT?
 *
 * probeForeignKeys answers "is the pragma on". This answers "does it bite",
 * which is a different question — enforcement being on does not by itself
 * prove this table's constraint is real.
 *
 * Nothing survives this function. The insert runs inside a transaction that
 * is thrown out on purpose, and the row is then counted and deleted by hand
 * rather than trusting the rollback to have happened.
 */
export const probeCategoryFkOnInsert = (): void => {
  const probeId = `fkprobe-${Date.now()}`;
  let accepted = false;

  try {
    tx(() => {
      run(
        `INSERT INTO expenses (id, title, amount_minor, currency_code, created_at, category_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          probeId,
          "FK probe",
          1,
          DEFAULT_CURRENCY,
          Date.now(),
          "__no_such_category__",
        ],
      );
      /* Reaching this line IS the answer: the insert was accepted, which
       * means nothing is enforcing the constraint. Set the flag first, then
       * throw to unwind the transaction. */
      accepted = true;
      throw new Error("rollback: probe only");
    });
  } catch (err) {
    /* Two different throws land here and they mean opposite things. The
     * `accepted` flag tells them apart, not the message. */
    console.log("probe threw ->", String(err));
  }

  /* Do not trust the rollback. Ask. This also makes the function safe if tx()
   * turns out not to rethrow. */
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

/**
 * Every category write, checked from one button.
 *
 * Nothing survives this function. It creates its own probe category and
 * deletes it, renames the uncategorised row and renames it back, and runs
 * both destructive cases inside transactions it throws out on purpose.
 *
 * The two counts at the end are the proof. If either moved, something in here
 * committed when it should not have.
 */
export const probeCategoryWrites = (): void => {
  const PROBE_NAME = "__probe category__";
  const out: string[] = [];

  const countExpenses = (): number =>
    all<{ n: number }>(`SELECT COUNT(*) AS n FROM expenses`)[0]?.n ?? 0;
  const countCategories = (): number =>
    all<{ n: number }>(`SELECT COUNT(*) AS n FROM categories`)[0]?.n ?? 0;

  const ok = (label: string, pass: boolean, detail = ""): void => {
    out.push(
      `${pass ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
    );
  };

  /* The message is checked, not just the fact that something threw. A
   * TypeError would otherwise read as a pass, which is the failure mode that
   * makes a green test suite worthless. */
  const throws = (label: string, contains: string, fn: () => void): void => {
    try {
      fn();
      out.push(`FAIL  ${label} — nothing threw`);
    } catch (err) {
      const msg = String(err);
      out.push(
        msg.includes(contains)
          ? `ok    ${label}`
          : `FAIL  ${label} — threw the wrong thing: ${msg}`,
      );
    }
  };

  const expensesBefore = countExpenses();
  const categoriesBefore = countCategories();
  console.log(
    `--- probeCategoryWrites | ${expensesBefore} expenses, ${categoriesBefore} categories ---`,
  );

  /* insertCategory */
  let probeId = "";
  try {
    const made = insertCategory(PROBE_NAME);
    probeId = made.id;
    ok(
      "1  insertCategory returns a cat- id",
      made.id.startsWith("cat-"),
      made.id,
    );
  } catch (err) {
    ok("1  insertCategory", false, String(err));
  }

  throws("2  exact duplicate rejected", "already exists", () =>
    insertCategory(PROBE_NAME),
  );

  /* Against a row a migration shipped, so this proves COLLATE NOCASE works on
   * real data rather than on something this function just made. */
  throws("3  'food' rejected against shipped 'Food'", "already exists", () =>
    insertCategory("food"),
  );

  throws("4  whitespace-only name rejected", "cannot be empty", () =>
    insertCategory("   "),
  );

  /* renameCategory */
  if (probeId) {
    /* The excludeId branch of the name check. Without it this throws, because
     * the query finds the very row being renamed. */
    try {
      renameCategory(probeId, PROBE_NAME);
      ok("5  rename to its own name allowed", true);
    } catch (err) {
      ok("5  rename to its own name allowed", false, String(err));
    }

    throws("6  rename onto 'Food' rejected", "already exists", () =>
      renameCategory(probeId, "Food"),
    );
  }

  throws("7  rename of an unknown id rejected", "No category with id", () =>
    renameCategory("__no_such_category__", "Whatever"),
  );

  /* deleteCategory guards. Both throw before any transaction opens, so there
   * is nothing to undo. */
  throws("8  deleting Uncategorised rejected", "cannot be deleted", () =>
    deleteCategory(UNCATEGORISED_ID),
  );

  throws("9  deleting an unknown id rejected", "No category with id", () =>
    deleteCategory("__no_such_category__"),
  );

  /* The fallback survives a rename. Renaming writes `name` and leaves `id`
   * alone — this is the check that it is true. */
  const originalName =
    all<{ name: string }>(`SELECT name FROM categories WHERE id = ?`, [
      UNCATEGORISED_ID,
    ])[0]?.name ?? "Uncategorised";

  try {
    renameCategory(UNCATEGORISED_ID, "Misc");
    const made = insertExpense(
      "__probe expense__",
      asMinor(100),
      DEFAULT_CURRENCY,
    );
    const landed = all<{ category_id: string | null }>(
      `SELECT category_id FROM expenses WHERE id = ?`,
      [made.id],
    )[0];
    ok(
      "10 renamed fallback still receives new expenses",
      landed?.category_id === UNCATEGORISED_ID,
      `category_id = ${String(landed?.category_id)}`,
    );
    run(`DELETE FROM expenses WHERE id = ?`, [made.id]);
  } catch (err) {
    ok("10 renamed fallback still receives new expenses", false, String(err));
  } finally {
    /* Put the name back whatever happened above. A probe that leaves the
     * database renamed is a probe you can only run once. */
    try {
      renameCategory(UNCATEGORISED_ID, originalName);
    } catch (err) {
      out.push(`FAIL  10 could not restore the name — ${String(err)}`);
    }
  }

  /* The ordering rule. Pick the fullest real category rather than hardcoding
   * one, which may not exist by the time you run this. */
  const victim = all<{ id: string; n: number }>(
    `SELECT c.id AS id, COUNT(e.id) AS n
       FROM categories c
       LEFT JOIN expenses e ON e.category_id = c.id
      WHERE c.id <> ? AND c.id <> ?
      GROUP BY c.id
      ORDER BY n DESC
      LIMIT 1`,
    [UNCATEGORISED_ID, probeId || "__none__"],
  )[0];

  if (!victim || victim.n === 0) {
    out.push(
      `SKIP  11 no category has expenses in it — the ordering check needs one`,
    );
  } else {
    /* Wrong order, on purpose. DELETE first, with rows still pointing here. */
    try {
      tx(() => {
        run(`DELETE FROM categories WHERE id = ?`, [victim.id]);
        run(`UPDATE expenses SET category_id = ? WHERE category_id = ?`, [
          UNCATEGORISED_ID,
          victim.id,
        ]);
        throw new Error("rollback: probe only");
      });
      out.push(
        "FAIL  11 wrong order was ACCEPTED — the foreign key is not biting",
      );
    } catch (err) {
      const msg = String(err).toUpperCase();
      out.push(
        msg.includes("FOREIGN KEY")
          ? `ok    11 wrong order rejected by the foreign key (${victim.id}, ${victim.n} rows)`
          : `FAIL  11 threw something else — ${String(err)}`,
      );
    }

    /*
     * Right order, timed, then rolled back.
     *
     * The UPDATE really runs, so the time is real work. It is NOT the
     * committed number though — a rollback writes the journal differently
     * from a commit. Treat it as a floor, not as the answer.
     */
    let ms = -1;
    try {
      tx(() => {
        const t0 = Date.now();
        run(`UPDATE expenses SET category_id = ? WHERE category_id = ?`, [
          UNCATEGORISED_ID,
          victim.id,
        ]);
        run(`DELETE FROM categories WHERE id = ?`, [victim.id]);
        ms = Date.now() - t0;
        throw new Error("rollback: probe only");
      });
    } catch (err) {
      if (ms < 0) out.push(`FAIL  12 right order threw — ${String(err)}`);
    }
    if (ms >= 0) {
      out.push(
        `ok    12 right order accepted — ${victim.n} rows moved in ${ms}ms (rolled back)`,
      );
    }
  }

  /* Clean up, then prove nothing stuck. */
  if (probeId) {
    try {
      deleteCategory(probeId);
    } catch (err) {
      out.push(`FAIL  cleanup — probe category left behind: ${String(err)}`);
    }
  }

  const expensesAfter = countExpenses();
  const categoriesAfter = countCategories();
  ok(
    "13 expense count unchanged",
    expensesAfter === expensesBefore,
    `${expensesBefore} -> ${expensesAfter}`,
  );
  ok(
    "14 category count unchanged",
    categoriesAfter === categoriesBefore,
    `${categoriesBefore} -> ${categoriesAfter}`,
  );

  console.log(out.join("\n"));
  console.log(
    out.some((line) => line.startsWith("FAIL"))
      ? "--- SOMETHING FAILED, read the lines above ---"
      : "--- all checks passed ---",
  );
};

/**
 * The expense read and write used by the edit form.
 *
 * Nothing survives this function. It picks a real expense, updates it inside
 * a transaction it throws away, and checks the row afterwards rather than
 * trusting the rollback to have happened.
 *
 * Check 4 is the reason this exists. updateExpense takes currencyCode and
 * categoryId next to each other, both strings, so swapping them compiles
 * cleanly and the title and amount still land correctly. Reading those two
 * columns back BY NAME is the only thing that catches it.
 */
export const probeExpenseWrites = (): void => {
  const out: string[] = [];

  /* Pick a real row instead of hardcoding an id. A hardcoded one stops
   * existing the first time you clear the seed. */
  const victim = all<{ id: string }>(
    `SELECT id FROM expenses ORDER BY created_at DESC, id DESC LIMIT 1`,
  )[0];

  if (!victim) {
    console.log("probeExpenseWrites: the table is empty, nothing to probe");
    return;
  }

  const before = readExpenseForEdit(victim.id);
  if (!before) {
    console.log(`FAIL  1 readExpenseForEdit returned null for ${victim.id}`);
    return;
  }
  out.push(
    `ok    1 read it — "${before.title}", ${before.amountMinor}, ${
      before.currencyCode
    }, category ${before.category ? before.category.name : "NULL"}`,
  );

  try {
    updateExpense("__no_such_expense__", "x", asMinor(1), DEFAULT_CURRENCY);
    out.push("FAIL  2 an unknown id was accepted");
  } catch (err) {
    out.push(
      String(err).includes("No expense with id")
        ? "ok    2 unknown id rejected"
        : `FAIL  2 threw the wrong thing — ${String(err)}`,
    );
  }

  const PROBE_TITLE = "__probe title__";
  const PROBE_AMOUNT = asMinor(4242);

  try {
    tx(() => {
      updateExpense(
        victim.id,
        PROBE_TITLE,
        PROBE_AMOUNT,
        DEFAULT_CURRENCY,
        UNCATEGORISED_ID,
      );

      /* Raw columns, NOT readExpenseForEdit's output. That function maps
       * columns onto names, so it would present a swapped pair as if it were
       * fine. This asks the database for each column by its own name. */
      const raw = all<{
        title: string;
        amount_minor: number;
        currency_code: string;
        category_id: string | null;
      }>(
        `SELECT title, amount_minor, currency_code, category_id
           FROM expenses WHERE id = ?`,
        [victim.id],
      )[0];

      out.push(
        raw?.title === PROBE_TITLE && raw?.amount_minor === PROBE_AMOUNT
          ? "ok    3 title and amount written"
          : `FAIL  3 title/amount wrong — ${JSON.stringify(raw)}`,
      );
      out.push(
        raw?.currency_code === DEFAULT_CURRENCY &&
          raw?.category_id === UNCATEGORISED_ID
          ? "ok    4 currency and category landed in their own columns"
          : `FAIL  4 columns swapped or wrong — ${JSON.stringify(raw)}`,
      );

      throw new Error("rollback: probe only");
    });
  } catch (err) {
    /* Two different throws land here. Only one of them is expected. */
    if (!String(err).includes("rollback: probe only")) {
      out.push(`FAIL  3/4 threw — ${String(err)}`);
    }
  }

  /* Do not trust the rollback. Ask. */
  const after = readExpenseForEdit(victim.id);
  out.push(
    after?.title === before.title && after?.amountMinor === before.amountMinor
      ? "ok    5 the row is unchanged after the rollback"
      : `FAIL  5 THE PROBE COMMITTED — row is now ${JSON.stringify(after)}`,
  );

  console.log(out.join("\n"));
  console.log(
    out.some((l) => l.startsWith("FAIL"))
      ? "--- SOMETHING FAILED, read the lines above ---"
      : "--- all checks passed ---",
  );
};

/**
 * Delete and undo, checked from one button.
 *
 * Nothing survives this function. It picks a real expense, deletes it and
 * puts it back inside a transaction it throws away, then checks the row
 * afterwards rather than trusting the rollback to have happened.
 *
 * Check 4 is the reason this exists. Undo has to bring the row back with its
 * ORIGINAL id and created_at. insertExpense would invent new ones, and the
 * row would come back as a different expense at the top of the list. Only a
 * column-by-column comparison, by name, can tell those apart.
 *
 * What check 6 cannot prove: that the rollback happened. A delete followed by
 * a correct restore leaves the row exactly as it was, so a transaction that
 * committed would pass check 6 too. What it does prove is that the real row
 * is intact, which is the question that matters here. That tx() rolls back is
 * proven by probeExpenseWrites check 5, where a commit would be visible.
 */
export const probeExpenseDelete = (): void => {
  const out: string[] = [];

  /*
   * SELECT *, not a column list. A hand-written list only compares the
   * columns someone remembered to write down. This compares whatever the
   * table actually has — including a column restoreExpense does not know
   * about, which would come back empty and fail check 4 by name.
   */
  const readRaw = (id: string): Record<string, unknown> | undefined =>
    all<Record<string, unknown>>(`SELECT * FROM expenses WHERE id = ?`, [
      id,
    ])[0];

  /* Every column whose value differs, named. An empty list means the two
   * rows are identical. */
  const columnsThatDiffer = (
    was: Record<string, unknown>,
    now: Record<string, unknown> | undefined,
  ): string[] => {
    if (!now) return ["the whole row is missing"];
    return Object.keys(was)
      .filter((col) => was[col] !== now[col])
      .map(
        (col) =>
          `${col}: ${JSON.stringify(was[col])} -> ${JSON.stringify(now[col])}`,
      );
  };

  /* Same choice of victim as probeExpenseWrites: the newest real row, never
   * a hardcoded id. */
  const victim = all<{ id: string }>(
    `SELECT id FROM expenses ORDER BY created_at DESC, id DESC LIMIT 1`,
  )[0];

  if (!victim) {
    console.log("probeExpenseDelete: the table is empty, nothing to probe");
    return;
  }

  const before = readRaw(victim.id);
  if (!before) {
    console.log(`FAIL  1 could not read ${victim.id}`);
    return;
  }
  /* The whole row, printed. This line doubles as the table's real column
   * list, read from the database rather than from a note. */
  out.push(`ok    1 read it — ${JSON.stringify(before)}`);

  /* Outside the transaction on purpose. The guard throws before any write,
   * so there is nothing to roll back. */
  try {
    deleteExpense("__no_such_expense__");
    out.push("FAIL  2 an unknown id was accepted");
  } catch (err) {
    out.push(
      String(err).includes("No expense with id")
        ? "ok    2 unknown id rejected"
        : `FAIL  2 threw the wrong thing — ${String(err)}`,
    );
  }

  try {
    tx(() => {
      const copy = deleteExpense(victim.id);

      /*
       * The copy is everything undo will have, so it must match the row it
       * came from. Compared field by field, because the copy spells the
       * column names differently.
       */
      const copyMatches =
        copy.id === before.id &&
        copy.title === before.title &&
        copy.amountMinor === before.amount_minor &&
        copy.currencyCode === before.currency_code &&
        copy.createdAt === before.created_at &&
        copy.categoryId === before.category_id;
      const gone = readRaw(victim.id) === undefined;

      out.push(
        copyMatches && gone
          ? "ok    3 deleted, and the returned copy matches the row"
          : `FAIL  3 copy matches: ${copyMatches}, row gone: ${gone} — ${JSON.stringify(
              copy,
            )}`,
      );

      restoreExpense(copy);
      const wrong = columnsThatDiffer(before, readRaw(victim.id));
      out.push(
        wrong.length === 0
          ? "ok    4 restored — every column matches, id and created_at included"
          : `FAIL  4 restored row differs — ${wrong.join("; ")}`,
      );

      /*
       * The wrong thing, on purpose: Undo pressed twice. The row is already
       * back, so this has to be refused.
       *
       * The message says UNIQUE, not PRIMARY KEY. A TEXT primary key is
       * enforced by the automatic unique index SQLite builds for it.
       */
      try {
        restoreExpense(copy);
        out.push(
          "FAIL  5 a second restore was ACCEPTED — the row exists twice",
        );
      } catch (err) {
        out.push(
          String(err).toUpperCase().includes("UNIQUE")
            ? "ok    5 second restore rejected by the primary key"
            : `FAIL  5 threw the wrong thing — ${String(err)}`,
        );
      }

      throw new Error("rollback: probe only");
    });
  } catch (err) {
    /* Two different throws land here. Only one of them is expected. */
    if (!String(err).includes("rollback: probe only")) {
      out.push(`FAIL  3-5 threw — ${String(err)}`);
    }
  }

  /* Do not trust the rollback. Ask. */
  const after = columnsThatDiffer(before, readRaw(victim.id));
  out.push(
    after.length === 0
      ? "ok    6 the row is unchanged after the rollback"
      : `FAIL  6 THE ROW CHANGED — ${after.join("; ")}`,
  );

  console.log(out.join("\n"));
  console.log(
    out.some((l) => l.startsWith("FAIL"))
      ? "--- SOMETHING FAILED, read the lines above ---"
      : "--- all checks passed ---",
  );
};