import { asMinor, DEFAULT_CURRENCY, type Minor } from "@et/shared";
import { all, run, tx } from ".";

/**
 * The category row that must always exist.
 *
 * A migration creates it and points every uncategorised expense at it, and
 * `insertExpense` falls back to it when the caller chooses nothing.
 *
 * It CAN be renamed. Renaming writes `categories.name` and leaves the id
 * alone, so this constant and every row pointing here keep working.
 *
 * It CANNOT be deleted. `deleteCategory` reassigns rows INTO this id, so
 * removing it would delete its own target.
 *
 * Exported because any screen showing a category list has to recognise it —
 * it is the row that gets no delete button.
 */
export const UNCATEGORISED_ID = "uncategorised";

export type Expense = {
  id: string;
  title: string;
  amountMinor: Minor;
  currencyCode: string;
  createdAt: number;
};

/* What SQLite hands back: snake_case, exactly as the columns are declared. */
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
    /*
     * The read boundary. SQLite hands back an untyped number and this is the
     * only place it becomes Minor. A stored float throws here, loudly,
     * instead of being silently rounded away by the display.
     */
    amountMinor: asMinor(row.amount_minor),
    currencyCode: row.currency_code,
    createdAt: row.created_at,
  };
};

export const PAGE_SIZE = 50;

const LIST_PAGE_HEAD = `SELECT id, title, amount_minor, currency_code, created_at
       FROM expenses`;

const LIST_PAGE_TAIL = `ORDER BY created_at DESC, id DESC`;

/**
 * The unfiltered page query.
 *
 * Exported so the dev tooling can ask SQLite to EXPLAIN this exact text.
 * Nothing outside this module should ever rebuild or edit it — the recorded
 * timings for the list describe this string character for character, and a
 * reworded version is a different query with different numbers.
 */
export const LIST_PAGE_SELECT = `${LIST_PAGE_HEAD}
      ${LIST_PAGE_TAIL}`;

/**
 * The filtered page query.
 *
 * Two separate strings rather than one carrying
 * `WHERE (? IS NULL OR category_id = ?)`.
 *
 * That clever single-string version was measured and SQLite answered it with
 * a full table scan even with an index present. The planner has to evaluate
 * that test row by row, so it cannot reach for an index. Keeping the filter
 * as its own plain equality is what lets the index be used at all.
 *
 * Exported for EXPLAIN, with the same warning as above: do not edit the text.
 */
export const LIST_PAGE_SELECT_FILTERED = `${LIST_PAGE_HEAD}
      WHERE category_id = ?
      ${LIST_PAGE_TAIL}`;

/**
 * One page of expenses, newest first.
 *
 * @param offset How many rows to skip. 0 for the first page, PAGE_SIZE for
 *   the second, and so on.
 * @param categoryId Omit for every category.
 */
export const listExpensePage = (
  offset: number,
  categoryId?: string,
): Expense[] => {
  /*
   * Two calls rather than one array built conditionally. The parameter ORDER
   * differs between the branches, and that is exactly the kind of thing a
   * shared array gets quietly wrong.
   */
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

/*
 * The only place an id is generated in this app.
 *
 * TODO: must become a real UUID once a second device can create rows.
 * Date.now() collides if two devices write inside the same millisecond and
 * nothing here would notice.
 */
const newId = (prefix = ""): string =>
  `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Add an expense.
 *
 * @param categoryId Optional, and the default is a REAL row rather than NULL.
 *   'uncategorised' already means "not sorted yet", so there is nothing NULL
 *   would express that this does not. Keeping the column nullable-but-never-
 *   null also avoids wanting NOT NULL, which SQLite cannot add to an existing
 *   column without rebuilding the table — and a rebuild drops and recreates
 *   every index on it.
 */
export const insertExpense = (
  title: string,
  amountMinor: Minor,
  currencyCode: string,
  categoryId: string = UNCATEGORISED_ID,
): Expense => {
  const expense: Expense = {
    id: newId(),
    title,
    currencyCode,
    amountMinor,
    createdAt: Date.now(),
  };

  run(
    /*
     * category_id is passed EXPLICITLY rather than left to fall to NULL.
     *
     * The column is nullable with no default — SQLite forced that, because an
     * added column carrying REFERENCES cannot have a non-NULL default. So
     * omitting it here would work, and would quietly produce a database where
     * migrated rows say 'uncategorised' and every row added afterwards says
     * NULL. Two spellings of the same idea, both present.
     *
     * currencyCode and categoryId are both strings and they are adjacent.
     * Swapping them compiles. The foreign key on category_id is the only
     * thing that catches it.
     */
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

/**
 * How many expenses and how much money, for the header.
 *
 * COUNT and SUM are aggregates — SQLite squashes many rows into one value
 * internally, so no rows and no objects cross into JavaScript.
 *
 * @param categoryId Omit for every category. When given, the total MUST
 *   narrow with it: a list showing one category above a total showing
 *   everything is a screen that lies quietly.
 */
export const readTotals = (
  categoryId?: string,
): { count: number; totalMinor: Minor } => {
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

  /*
   * COUNT(*) is correct here. There is no join, so no NULL-filled row can
   * appear — an empty result is genuinely zero rows, not one blank one.
   */
  const row = rows[0] ?? { n: 0, total: null };
  return {
    count: row.n,
    /* Filtering to an empty category hits this for real: SUM over zero rows
     * is NULL, not 0. */
    totalMinor: asMinor(row.total ?? 0),
  };
};

export type CategoryBreakdown = {
  id: string;
  name: string;
  count: number;
  totalMinor: Minor;
};

/**
 * Every category, with how many expenses are in it and how much money.
 *
 * Reads FROM categories and joins expenses onto it, not the other way round.
 * Grouping over expenses alone returns no row at all for an empty category,
 * because there is nothing there to group. A breakdown has to show the empty
 * ones, so categories has to be the table being read.
 *
 * Takes NO filter, and that is deliberate rather than an omission. Its job is
 * to show what you could switch to. Filtering it would show one category and
 * a column of zeroes.
 */
export const readCategoryBreakdown = (): CategoryBreakdown[] => {
  const rows = all<{
    id: string;
    name: string;
    n: number;
    total: number | null;
  }>(
    /*
     * COUNT(e.id), NOT COUNT(*).
     *
     * The LEFT JOIN still produces one row for an empty category, with every
     * e.* column NULL. COUNT(*) counts rows and would report 1. COUNT(e.id)
     * counts non-NULL values and reports 0. Nothing throws either way, so
     * this is a wrong number on screen rather than a crash.
     *
     * ORDER BY total DESC puts the biggest spend first. SQLite sorts NULL
     * below everything, so empty categories land at the bottom on their own.
     * c.id is the tiebreaker — two categories with equal totals must not swap
     * places between reads.
     */
    `SELECT c.id                AS id,
            c.name              AS name,
            COUNT(e.id)         AS n,
            SUM(e.amount_minor) AS total
       FROM categories c
       LEFT JOIN expenses e ON e.category_id = c.id
      GROUP BY c.id, c.name
      ORDER BY total DESC, c.id ASC`,
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    count: r.n,
    totalMinor: asMinor(r.total ?? 0),
  }));
};

export type Category = { id: string; name: string };

/**
 * Every category, name and id only. The read a picker wants.
 *
 * This is NOT readCategoryBreakdown with the numbers ignored. That query
 * LEFT JOINs the whole expenses table to produce these same names, and it
 * orders by total — correct for a report, wrong for a picker, because the
 * rows would move as spending changes.
 *
 * ORDER BY name is here for stability, not for looks. A picker whose rows
 * reorder between opens defeats muscle memory.
 *
 * Returns every category including the uncategorised one. Whether a surface
 * shows that row is the surface's decision, not this query's.
 */
export const readCategories = (): Category[] =>
  all<Category>(`SELECT id, name FROM categories ORDER BY name ASC`);

/* ─── Category writes ──────────────────────────────────────────────────── */

const CATEGORY_PREFIX = "cat-";

/*
 * categories.name is TEXT NOT NULL, and NOT NULL does not stop ''. An empty
 * string is a value, so the constraint is satisfied and a blank category
 * inserts cleanly — then renders as a row you cannot identify well enough to
 * rename. This is the guard the schema is not able to be.
 */
const cleanCategoryName = (name: string): string => {
  const clean = name.trim();
  if (clean.length === 0) {
    throw new Error("Category name cannot be empty.");
  }
  return clean;
};

/*
 * COLLATE NOCASE because SQLite compares TEXT case-sensitively by default.
 * Without it, 'Food' and 'food' are different names and both get in.
 *
 * This is a CHECK, not a CONSTRAINT, and the difference matters. A UNIQUE
 * index would make duplicates impossible. This only makes them impossible
 * through these functions. A real constraint is deferred because uniqueness
 * will eventually be per user, and a global one added now would have to be
 * dropped — which means rebuilding the table.
 *
 * Two queries rather than one carrying "AND id <> COALESCE(?, '')". Same
 * reason the page query is held as two strings: a test the planner has to
 * evaluate row by row is a test it cannot use an index for.
 *
 * @param excludeId Pass the row being renamed, so keeping its own name is
 *   not treated as a clash with itself.
 */
const assertNameFree = (name: string, excludeId?: string): void => {
  const rows = excludeId
    ? all<{ n: number }>(
        `SELECT COUNT(*) AS n
           FROM categories
          WHERE name = ? COLLATE NOCASE
            AND id <> ?`,
        [name, excludeId],
      )
    : all<{ n: number }>(
        `SELECT COUNT(*) AS n
           FROM categories
          WHERE name = ? COLLATE NOCASE`,
        [name],
      );

  if ((rows[0]?.n ?? 0) > 0) {
    throw new Error(`A category called "${name}" already exists.`);
  }
};

/**
 * Create a category.
 *
 * Returns the row it created, so a screen can select it without re-reading.
 *
 * @throws If the name is blank or already taken, case-insensitively.
 */
export const insertCategory = (name: string): Category => {
  const clean = cleanCategoryName(name);
  assertNameFree(clean);

  /*
   * An opaque id, not a slug of the name.
   *
   * A slug would still say 'groceries' on a category renamed to 'Shopping',
   * and two names that slugify alike would collide on the PRIMARY KEY. The id
   * has to survive a rename. The name, by definition, does not.
   *
   * Prefixed so the id says where the row came from: a bare word was shipped
   * by a migration, 'cat-...' was typed by the person using the app.
   */
  const category: Category = { id: newId(CATEGORY_PREFIX), name: clean };

  run(`INSERT INTO categories (id, name) VALUES (?, ?)`, [
    category.id,
    category.name,
  ]);

  return category;
};

/**
 * Rename a category.
 *
 * The uncategorised row is deliberately NOT blocked here. This writes `name`
 * and leaves `id` alone, so the insert fallback and the delete target both
 * keep working. Only deletion is blocked.
 *
 * @throws If the id does not exist, the name is blank, or the name is taken.
 */
export const renameCategory = (id: string, name: string): void => {
  const clean = cleanCategoryName(name);

  /*
   * Read the row before writing. An UPDATE that matches nothing changes zero
   * rows and throws nothing, so a stale id from a screen that has not
   * refreshed would do absolutely nothing and look exactly like success.
   */
  const existing = all<{ id: string }>(
    `SELECT id FROM categories WHERE id = ?`,
    [id],
  );
  if (existing.length === 0) {
    throw new Error(`No category with id "${id}".`);
  }

  assertNameFree(clean, id);

  run(`UPDATE categories SET name = ? WHERE id = ?`, [clean, id]);
};

/**
 * Delete a category, moving its expenses to the uncategorised row first.
 *
 * @returns How many expenses were moved.
 * @throws If the id is the uncategorised row, or does not exist.
 */
export const deleteCategory = (id: string): number => {
  /*
   * Both halves of this guard are needed and neither is redundant.
   *
   * A management screen will not render a delete button on this row, which is
   * the good experience. This throw stops a caller that does not have that
   * screen's manners.
   *
   * Deleting this row would also remove the target the UPDATE below moves
   * rows INTO, which fails as a foreign key error two lines later.
   */
  if (id === UNCATEGORISED_ID) {
    throw new Error("The Uncategorised category cannot be deleted.");
  }

  const existing = all<{ id: string }>(
    `SELECT id FROM categories WHERE id = ?`,
    [id],
  );
  if (existing.length === 0) {
    throw new Error(`No category with id "${id}".`);
  }

  const t0 = Date.now();
  let moved = 0;

  tx(() => {
    /*
     * Counted inside the transaction, so the number returned is the number
     * the UPDATE on the next line actually moves.
     *
     * COUNT(*) rather than readTotals(id). readTotals also computes
     * SUM(amount_minor), and amount_minor is not in the category index, so
     * that sum costs a table lookup per row. A confirmation dialog wants the
     * money. This does not.
     */
    const rows = all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM expenses WHERE category_id = ?`,
      [id],
    );
    moved = rows[0]?.n ?? 0;

    /*
     * THE ORDER OF THESE TWO STATEMENTS IS THE WHOLE FUNCTION.
     *
     * expenses.category_id REFERENCES categories(id) with no ON DELETE
     * clause, so NO ACTION applies: SQLite refuses to remove a categories row
     * while any expense still points at it. Enforcement is on, and tx() does
     * not turn it off.
     *
     * Swap these and the DELETE throws FOREIGN KEY constraint failed, tx()
     * rolls back, and nothing happens at all.
     *
     * Both parameters below are strings and they are adjacent. Swapped, this
     * moves every uncategorised expense INTO the category being deleted, and
     * then the DELETE fails on the foreign key. Loud, not silent.
     */
    run(`UPDATE expenses SET category_id = ? WHERE category_id = ?`, [
      UNCATEGORISED_ID,
      id,
    ]);

    run(`DELETE FROM categories WHERE id = ?`, [id]);
  });

  if (__DEV__) {
    /*
     * Timed here rather than from a dev button, because a button would time a
     * different code path than the one a real tap runs.
     *
     * Every moved row also moves inside the index that leads with
     * category_id. The created_at-only index does not contain the column and
     * is untouched.
     */
    console.log(
      `deleteCategory(${id}): moved ${moved} rows in ${Date.now() - t0}ms`,
    );
  }

  return moved;
};

/* ─── Suggestion ───────────────────────────────────────────────────────── */

/**
 * The category most often used for this exact title, or null.
 *
 * A read that runs BEFORE a write, to decide what the write is told.
 *
 * MOST COMMON WINS, not most recent. One mis-tap no longer redirects a title
 * you have categorised twenty times. The cost is the other side of the same
 * coin: changing your mind takes as many taps as the old habit has rows.
 *
 * COLLATE NOCASE matches the comparison used when creating categories, and it
 * is here because of real data: the same word gets typed with and without a
 * capital and those should not be two separate titles. SQLite's NOCASE folds
 * ASCII A-Z only — a title in any other script is compared byte for byte
 * whatever this says.
 *
 * Excluding the uncategorised row is not an optimisation. A title whose
 * expenses were never sorted has nothing to suggest, and offering
 * "Uncategorised" would look like the app decided something when it did not.
 * The exclusion runs BEFORE the grouping, so those rows never form a group.
 *
 * There is no index on `title`. At tens of thousands of rows this costs tens
 * of milliseconds and runs once per title blur, which was measured and
 * accepted. Add an index here if a title-based screen ever needs it.
 */
export const suggestCategory = (title: string): Category | null => {
  const clean = title.trim();
  /* An empty title would match any row that also has an empty title, and
   * suggest whatever that row happens to hold. */
  if (clean.length === 0) return null;

  const t0 = Date.now();

  const rows = all<{
    id: string;
    name: string;
    n: number;
    last_used: number;
  }>(
    /*
     * GROUP BY c.id, c.name, not e.category_id alone. SQLite ALLOWS a bare
     * column in an aggregate query and picks a value from some row in the
     * group — naming both columns means nothing is being picked on our
     * behalf.
     *
     * COUNT(*) is correct here, and this is the OPPOSITE of the rule in
     * readCategoryBreakdown. That one LEFT JOINs, so an empty category still
     * produces a row and COUNT(*) would report 1. This is an INNER JOIN — a
     * group cannot exist unless it has rows.
     *
     * Three ORDER BY levels, and the last two are not decoration:
     *   n DESC          the rule: most common wins
     *   last_used DESC  on a tie, the more recently used one wins. That is
     *                   the old newest-wins rule surviving exactly where
     *                   counting cannot decide — including a brand new title,
     *                   where every count is 1
     *   c.id ASC        nothing can tie past this, so the same table always
     *                   gives the same answer
     */
    `SELECT c.id   AS id,
            c.name AS name,
            COUNT(*)            AS n,
            MAX(e.created_at)   AS last_used
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
      WHERE e.title = ? COLLATE NOCASE
        AND e.category_id <> ?
      GROUP BY c.id, c.name
      ORDER BY n DESC, last_used DESC, c.id ASC
      LIMIT 1`,
    [clean, UNCATEGORISED_ID],
  );

  const top = rows[0];

  if (__DEV__) {
    /* The count is in the log for a reason. When a tap will not stick, this
     * is the line that tells you how many rows you are arguing with. */
    console.log(
      `suggestCategory("${clean}"): ${
        top ? `${top.name} x${top.n}` : "no match"
      } in ${Date.now() - t0}ms`,
    );
  }

  /* The count and last_used are for the log only. The caller gets a plain
   * Category, so nothing upstream changes. */
  return top ? { id: top.id, name: top.name } : null;
};

/* ─── Editing one expense ──────────────────────────────────────────────── */

export type ExpenseForEdit = {
  id: string;
  title: string;
  amountMinor: Minor;
  currencyCode: string;
  createdAt: number;
  /*
   * The whole category row, not just its id. An edit form renders the
   * category's NAME, so returning only an id would force the form into a
   * second query to turn it back into text.
   *
   * null means the row has no category at all, which the foreign key should
   * make impossible. A form should treat it the same as uncategorised.
   */
  category: Category | null;
};

/**
 * One expense with everything an edit form needs, read fresh when the form
 * opens.
 *
 * This exists so the list page query never has to change. That query's text
 * is fixed — the recorded list timings describe it character for character,
 * and adding a column would make every one of those numbers describe
 * something else.
 *
 * The price of reading here instead is one lookup by PRIMARY KEY, which
 * SQLite answers by going straight to the row. The dev log below reports what
 * that actually costs rather than assuming it is free.
 *
 * @returns null if no expense has that id.
 */
export const readExpenseForEdit = (id: string): ExpenseForEdit | null => {
  const t0 = Date.now();

  /*
   * LEFT JOIN, not JOIN.
   *
   * category_id is nullable with no default, because SQLite refuses a
   * non-NULL default on an added column carrying REFERENCES. insertExpense
   * always passes a value, so a NULL should be impossible. If one existed, an
   * INNER JOIN would return zero rows and the edit form would open blank with
   * nothing thrown — a wrong screen rather than a crash.
   */
  const rows = all<{
    id: string;
    title: string;
    amount_minor: number;
    currency_code: string;
    created_at: number;
    category_id: string | null;
    category_name: string | null;
  }>(
    `SELECT e.id            AS id,
            e.title         AS title,
            e.amount_minor  AS amount_minor,
            e.currency_code AS currency_code,
            e.created_at    AS created_at,
            e.category_id   AS category_id,
            c.name          AS category_name
       FROM expenses e
       LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.id = ?`,
    [id],
  );

  const row = rows[0];

  if (__DEV__) {
    console.log(
      `readExpenseForEdit(${id}): ${
        row ? "found" : "MISSING"
      } in ${Date.now() - t0}ms`,
    );
  }

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    /* Same read boundary as the list. A stored float throws here, loudly. */
    amountMinor: asMinor(row.amount_minor),
    currencyCode: row.currency_code,
    createdAt: row.created_at,
    /*
     * Both halves checked. An id with no name behind it would mean a row
     * pointing at a deleted category, which the foreign key makes impossible
     * — but null is the safe answer if it ever happens.
     */
    category:
      row.category_id && row.category_name
        ? { id: row.category_id, name: row.category_name }
        : null,
  };
};

/**
 * Change an existing expense.
 *
 * `created_at` is deliberately NOT in the SET list. The expense happened when
 * it happened. Fixing a typo in the amount must not move the row to the top
 * of a list sorted by created_at, and it would also make every edit rewrite
 * the row's position inside both created_at indexes.
 *
 * @throws If no expense has that id.
 */
export const updateExpense = (
  id: string,
  title: string,
  amountMinor: Minor,
  currencyCode: string,
  categoryId: string = UNCATEGORISED_ID,
): void => {
  /*
   * Read before writing, same guard and same reason as renameCategory. An
   * UPDATE that matches nothing changes zero rows and throws nothing, so a
   * stale id would do absolutely nothing and look exactly like success.
   */
  const existing = all<{ id: string }>(`SELECT id FROM expenses WHERE id = ?`, [
    id,
  ]);
  if (existing.length === 0) {
    throw new Error(`No expense with id "${id}".`);
  }

  run(
    /*
     * currencyCode and categoryId are adjacent strings — the same hazard
     * insertExpense carries. Swapped, this writes a category id into
     * currency_code, and the currency lookup throws the next time the row is
     * formatted, on a different screen, long after the edit. The foreign key
     * only catches the other half of the swap.
     */
    `UPDATE expenses
        SET title = ?, amount_minor = ?, currency_code = ?, category_id = ?
      WHERE id = ?`,
    [title, amountMinor, currencyCode, categoryId, id],
  );
};


/* ─── Deleting one expense, and putting it back ────────────────────────── */

/**
 * An expense as the list shows it, plus the one column the list query leaves
 * out: its category.
 *
 * This is what undo holds between a delete and a restore. The list's own
 * Expense is not enough — LIST_PAGE_SELECT does not select category_id, so a
 * row rebuilt from it would come back with no category.
 *
 * categoryId allows null because the column does. Restore puts back exactly
 * what was there, a NULL included, rather than tidying it on the way.
 */
export type DeletedExpense = Expense & { categoryId: string | null };

/**
 * Delete one expense, and hand back everything needed to undo it.
 *
 * This is a real DELETE. There is no deleted_at column, so once this returns,
 * the object it returns is the only complete copy of the row anywhere.
 * Whoever calls this holds that copy for as long as undo is on offer.
 *
 * @returns The row as it was, every column.
 * @throws If no expense has that id.
 */
export const deleteExpense = (id: string): DeletedExpense => {
  const t0 = Date.now();

  /*
   * Read before deleting, for two reasons.
   *
   * A DELETE that matches nothing removes zero rows and throws nothing, so a
   * stale id would look exactly like success. Same guard as updateExpense.
   *
   * And this read IS the undo. After the DELETE below, there is nowhere left
   * to read the row from.
   *
   * No transaction around the pair. all() and run() are synchronous, so no
   * other code in the app can run between the read and the delete.
   * deleteCategory needs tx() because it makes two writes; this makes one.
   */
  const rows = all<ExpenseRow & { category_id: string | null }>(
    `SELECT id, title, amount_minor, currency_code, created_at, category_id
       FROM expenses
      WHERE id = ?`,
    [id],
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`No expense with id "${id}".`);
  }

  run(`DELETE FROM expenses WHERE id = ?`, [id]);

  if (__DEV__) {
    /* Title and amount are in the line so a pasted log shows WHICH row went,
     * not just that something did. */
    console.log(
      `deleteExpense(${id}): "${row.title}" ${row.amount_minor} in ${
        Date.now() - t0
      }ms`,
    );
  }

  /* toExpense is the list's own read boundary, so a stored float throws here
   * instead of travelling into the undo copy. */
  return { ...toExpense(row), categoryId: row.category_id };
};

/**
 * Put a deleted expense back, exactly as it was.
 *
 * Not insertExpense. That generates a new id and stamps created_at with the
 * current time, so a row restored through it would come back as a different
 * expense, dated now, at the top of the list.
 *
 * @throws If an expense with this id already exists.
 */
export const restoreExpense = (e: DeletedExpense): void => {
  const t0 = Date.now();

  run(
    /*
     * A plain INSERT. Deliberately not INSERT OR REPLACE, and not an upsert.
     *
     * If this id is already in the table, the row has already been put back
     * once. id is the PRIMARY KEY, so SQLite rejects the second attempt and
     * throws — which is the outcome wanted. An upsert would accept it quietly
     * and hide whatever called restore twice. probeExpenseDelete checks this.
     *
     * Same column order as insertExpense, with the same hazard: currencyCode
     * and categoryId are adjacent strings, and swapping them still compiles.
     * probeExpenseDelete reads every column back by name to catch it.
     */
    `INSERT INTO expenses (id, title, amount_minor, currency_code, created_at, category_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [e.id, e.title, e.amountMinor, e.currencyCode, e.createdAt, e.categoryId],
  );

  if (__DEV__) {
    console.log(
      `restoreExpense(${e.id}): "${e.title}" in ${Date.now() - t0}ms`,
    );
  }
};
