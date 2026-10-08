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
  
  // 6 -> 7  ·  The index for the per-title page.
  //
  //   title FIRST, then the sort columns. Same shape and same reasoning as
  //   idx_expenses_category_created_at_id: one walk down the index serves
  //   the WHERE and the ORDER BY together, so no page pays for a temp
  //   B-tree. An index on title alone was measured and rejected — it serves
  //   the WHERE, hands the sort back, and both pages get slower.
  //
  //   COLLATE NOCASE is load-bearing, not decoration. Every query that
  //   matches a title compares with COLLATE NOCASE, and an index declared
  //   without it is ignored by all of them. That version was built on
  //   purpose during the measurement: the index exists, costs its disk and
  //   its write time on every insert, and every plan stays exactly as it
  //   was. Nothing throws. The rows still come back correct. Only
  //   EXPLAIN QUERY PLAN can tell the difference.
  //
    //   Measured before and after, Pixel 8 emulator (API 36), development
  //   build, 50,036 rows, one title holding 5,000 of them, warm medians:
  //
  //                                       before    after
  //     this title, this year  total       46ms       6ms   <- the reason
  //     this title, this year  page      14.5ms       6ms
  //     this title, all time   total       6.5ms      8ms
  //     this title, all time   page        15ms       6ms
  //     this title, this month total         2ms      1ms
  //
  //   Only the first two gaps beat their own spread. The year total is what
  //   this index is for: 7.7x, and it was the slowest thing on the page.
  //
  //   The all-time total did NOT get faster, and that is not a mistake. It
  //   traded a straight read of all 50,036 rows for 5,000 index seeks plus
  //   5,000 fetches back into the table to get each amount. One tenth the
  //   rows, scattered instead of sequential, and the two came out even.
  //   Putting amount_minor in this index would answer that total from the
  //   index alone — rejected, because it also pulls the all-expenses total
  //   onto this index, and that query has no before-number.
  //
  //   The year was the slow one while reading FEWER rows. Its plan used
  //   idx_expenses_created_at_id, which holds created_at and id and nothing
  //   else, so every row inside the year range had to be fetched out of the
  //   table to read its title and its amount. All time had no index it
  //   could use, read the table straight through in file order, and fetched
  //   nothing extra. Sequential beat scattered.
  //
  //   suggestCategory was expected to gain more than the title page does. It
  //   matches on title too and runs on every title blur. That expectation was
  //   never measured on this device, and off the device the figure is
  //   1.3-1.7x, not the 8x first predicted. The 8x came from a model of the
  //   query that was missing its JOIN categories, which is most of its cost.
  //   There is still no device before-number at a 5,000-row title, so what
  //   this index does for that lookup is unknown.
  //
  //   amount_minor is deliberately NOT a fourth column here. It would let
  //   the totals be answered from the index without touching the table at
  //   all, but it also pulls the all-expenses total onto this index — a
  //   query this change is not measuring and has no before-number for.
  //
  //   IF NOT EXISTS, same reasoning as 2 -> 3 and 5 -> 6. An index holds no
  //   data of its own, so "already there" and "just built" are the same
  //   database.
  `
  CREATE INDEX IF NOT EXISTS idx_expenses_title_created_at_id
    ON expenses (title COLLATE NOCASE, created_at DESC, id DESC);
  `,
    // 7 -> 8  ·  An icon name on each category.
  //
  //   TEXT and nullable, with NO default. NULL means nobody has chosen an
  //   icon for this category, and the card draws its placeholder for that. A
  //   stored placeholder would collapse two different facts into one value:
  //   "nobody chose" and "somebody chose the receipt" would be the same row,
  //   and nothing could tell them apart afterwards.
  //
  //   No IF NOT EXISTS, and that is not a judgement call here. SQLite does
  //   not parse IF NOT EXISTS on ADD COLUMN at all — it is a CREATE INDEX
  //   clause only, which is why 2 -> 3 can use it and this cannot.
  //
  //   A non-NULL DEFAULT would be legal on this column, unlike category_id's
  //   in 3 -> 4. That rule is about a REFERENCES clause, not about defaults,
  //   and this column has none. It is not used anyway, for the reason above.
  //
  //   ADD COLUMN writes a column definition into the schema and rewrites no
  //   rows. On a copy of this schema, adding a column to a 50,000-row table
  //   took 0.9ms and left page_count unchanged, while copying those rows into
  //   a new table took 42.7ms before a single index was rebuilt. So this is
  //   not the table rebuild that would drop and recreate every index.
  //
  //   The UPDATEs are reference data, like the rows they fill in: a fresh
  //   install should not open on a screen of identical placeholders.
  //
  //   Uncategorised is deliberately left NULL. It means "not sorted yet", and
  //   giving it an icon of its own would make it look sorted.
  //
  //   Bills does NOT get receipt-outline, which is otherwise the obvious
  //   glyph for it. That is the placeholder an iconless category draws, so
  //   Bills and Uncategorised would look identical on screen and a chosen
  //   icon could not be told from an unset one by eye.
  //
  //   No guard on the ids. A category that was deleted matches nothing, the
  //   UPDATE moves zero rows, and that is the right outcome rather than an
  //   error.
  //
  //   Every name below was checked against the installed Ionicons glyph map.
  //   Once a name lives in the database the type checker cannot see it, and
  //   an unknown name draws a literal "?" in the icon font without throwing.
  `
  ALTER TABLE categories ADD COLUMN icon_name TEXT;

  UPDATE categories SET icon_name = 'fast-food-outline'     WHERE id = 'food';
  UPDATE categories SET icon_name = 'bus-outline'           WHERE id = 'transport';
  UPDATE categories SET icon_name = 'document-text-outline' WHERE id = 'bills';
  UPDATE categories SET icon_name = 'home-outline'          WHERE id = 'rent';
  UPDATE categories SET icon_name = 'medkit-outline'        WHERE id = 'health';
  UPDATE categories SET icon_name = 'book-outline'          WHERE id = 'study';
  `,
];