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
  `,
];