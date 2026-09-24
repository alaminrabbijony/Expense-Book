export const MIGRATIONS: string[] = [
  // 0 -> 1  ·  initial schema
  `
  CREATE TABLE expenses (
    id            TEXT    PRIMARY KEY NOT NULL,
    title          TEXT    NOT NULL,
    amount_minor  INTEGER NOT NULL,
    created_at    INTEGER NOT NULL
  );
  `,

  // 1 -> 2  ·  Milestone 4. Two jobs, one transaction:
  //   (a) add currency_code. NOT NULL forces a DEFAULT, and 'BDT' is
  //       correct because every existing row really is taka.
  //   (b) repair rows that went in as floats via `Number(x) * 100`.
  //       ROUND is safe because sanitizeAmount caps input at 2 decimals,
  //       so any stored fraction is computer error, never real data.
  `
  ALTER TABLE expenses ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'BDT';

  UPDATE expenses
     SET amount_minor = CAST(ROUND(amount_minor) AS INTEGER)
   WHERE typeof(amount_minor) = 'real';
  `
  ,
    // 2 -> 3  ·  Milestone 5c. One index, matching the list query's
  //   ORDER BY exactly: created_at first, id as the tiebreaker.
  //
  //   Without it SQLite sorts the entire table on every page fetch.
  //   Measured at 50,015 rows: deep page 74ms without, 19ms with.
  //   EXPLAIN QUERY PLAN showed USE TEMP B-TREE FOR ORDER BY, and the
  //   line disappears once this exists.
  //
  //   IF NOT EXISTS is safe here in a way it would NOT be on an ALTER.
  //   An index holds no data of its own, so "already there" and "just
  //   built" are the same database.
  `
  CREATE INDEX IF NOT EXISTS idx_expenses_created_at_id
    ON expenses (created_at DESC, id DESC);
  `,
    // 3 -> 4  ·  Milestone 5d. Categories, and the app's first foreign key.
  //
  //   Four statements, and the ORDER is load-bearing. Enforcement is ON
  //   by the time this runs — db/index.ts sets it above the migrate()
  //   call — so every write here is checked as it happens.
  //
  //   (a) CREATE the list before anything can refer to it.
  //   (b) INSERT the 'uncategorised' row BEFORE the backfill at (d).
  //       Every existing row is about to claim it belongs to it (50,013
  //       when this first ran during development). If the row is missing,
  //       the first of those claims fails and the whole transaction rolls
  //       back. On a fresh install there are no rows, so nothing claims
  //       it and the order cannot bite. It only matters on a phone that
  //       already has data.  
  //   (c) The column is NULLABLE with no DEFAULT, and it HAS to be.
  //       SQLite forbids a non-NULL default on an added column that
  //       carries REFERENCES, whenever enforcement is on. currency_code
  //       got away with NOT NULL DEFAULT 'BDT' in 1 -> 2 only because it
  //       has no REFERENCES clause. One extra clause, different rules.
  //   (d) So the backfill has to be its own statement rather than a
  //       column default. That is not a workaround, it is the only
  //       legal shape.
  //
  //   No ON DELETE clause, so the default NO ACTION applies: deleting a
  //   category that still has expenses will fail with an error. CASCADE
  //   and SET NULL each decide a deletion policy, and that decision
  //   belongs with the delete UI in 5e, not buried in a migration.
  //
  //   No IF NOT EXISTS on the CREATE TABLE, deliberately. A table holds
  //   data, so "already there" and "just created" are NOT the same
  //   database. That is the opposite of the index in 2 -> 3, which holds
  //   no data of its own and is therefore safe to skip.
  //
  //   No WHERE on the UPDATE. Every row is NULL by construction, because
  //   the column came into existence three statements earlier. A WHERE
  //   that is always true is a comment pretending to be code.
  //   
  //   Enforcement must be ON when this runs, which is why db/index.ts sets
  //   the pragma above the migrate() call. Whether it was on for THIS
  //   device's own 3 -> 4 run is unrecorded — the pragma is connection-
  //   scoped, so nothing in the database file remembers.
  //
  //   What IS recorded: foreign_key_check returned zero violations across
  //   three runs, and COUNT(*) WHERE category_id IS NULL returned 0. The
  //   backfill is clean regardless of which way that went.
  `
  CREATE TABLE categories (
    id   TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL
  );

  INSERT INTO categories (id, name)
  VALUES ('uncategorised', 'Uncategorised');

  ALTER TABLE expenses ADD COLUMN category_id TEXT REFERENCES categories(id);

  UPDATE expenses
     SET category_id = 'uncategorised';
  `,

    // 4 -> 5  ·  Milestone 5e. The default categories.
  //
  //   Reference data, not test data. These rows ship to every install,
  //   the same way 'uncategorised' did in 3 -> 4. A tracker where you
  //   cannot say what an expense was for is broken, not empty.
  //
  //   Readable ids, not generated ones. They are matched by hand in the
  //   seeder and in the UI, so 'transport' being greppable is worth more
  //   than an opaque id being tidy.
  //
  //   No INSERT OR IGNORE. Same reason 3 -> 4 refused IF NOT EXISTS on
  //   the table: a second run means something is already wrong, and a
  //   throw that rolls back is the correct answer to that.
  //
  //   'uncategorised' is NOT re-inserted. It already exists from 3 -> 4,
  //   and inserting it again would throw on the primary key.
  //
  //   No UPDATE on expenses. Existing rows stay uncategorised because that
  //   is true — nobody has categorised them yet. When this first ran during
  //   development, the rest were seeded test rows about to be deleted, so
  //   re-pointing them was wasted work.
  //
  //   'rent' will hold zero seeded rows. That is deliberate: nothing in
  //   FAKE_TITLES is rent, and a category matching zero rows is the
  //   cleanest possible test case for the index in 5g.
  `
  INSERT INTO categories (id, name) VALUES
    ('food',      'Food'),
    ('transport', 'Transport'),
    ('bills',     'Bills'),
    ('rent',      'Rent'),
    ('health',    'Health'),
    ('study',     'Study');
  `,
    // 5 -> 6  ·  Milestone 5g. The index the filtered list actually needs.
  //
  //   category_id FIRST, then the sort columns. That order was measured,
  //   not preferred. Pixel 8 emulator, API 36, 50,022 rows, second
  //   readings, in milliseconds:
  //
  //     index shape                      food deep    rent page one
  //     none                                    76               63
  //     (category_id)                           40                1
  //     this one                                11                3
  //
  //   (category_id) alone is FASTER than this on rent and slower on food.
  //   It serves the WHERE and leaves the ORDER BY to a temp B-tree, and
  //   that sort gets more expensive the deeper you page. This shape serves
  //   both from one walk, so no filter in the table reads slower than 13ms.
  //   The choice was made on worst case, because that is the tap a person
  //   actually feels.
  //
  //   idx_expenses_created_at_id STAYS and is not replaced. This index
  //   cannot serve the unfiltered list — category_id leads it, and the
  //   unfiltered query has no category_id to bind. Verified rather than
  //   assumed: with this index present, the unfiltered plan still reads
  //   SCAN expenses USING INDEX idx_expenses_created_at_id.
  //
  //   IF NOT EXISTS, same reasoning as 2 -> 3. This index was built from a
  //   dev button during the 5g measurement, so on this device it is
  //   already here. An index holds no data of its own, so "already there"
  //   and "just built" are the same database.
  `
  CREATE INDEX IF NOT EXISTS idx_expenses_category_created_at_id
    ON expenses (category_id, created_at DESC, id DESC);
  `,
];