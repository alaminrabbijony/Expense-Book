
import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './migrations';
// Our own parameter type — deliberately not expo-sqlite's.
// Nothing outside this file should import from 'expo-sqlite'.
export type Param = string | number | null;

// DEV ONLY — comment out immediately after use.
// try {
//   SQLite.deleteDatabaseSync('expenses.db');
// } catch {
//   // nothing to delete, fine
// }

const db = SQLite.openDatabaseSync('expenses.db');



 // Write-ahead log mode. Plain English: instead of editing the database
// file directly, SQLite appends changes to a side file first and folds
// them in later. Readers aren't blocked by a writer, and a crash
// mid-write can't leave you with a half-edited database.
// You'll meet this idea again at Milestone 11 — same concept, on Postgres.


db.execSync('PRAGMA journal_mode = WAL;');


// Foreign key enforcement. SQLite ships with this OFF — verified on the
// Pixel 8 emulator, SQLite 3.50.3: `PRAGMA foreign_keys` read 0 on a fresh
// connection, before anything in this file had touched it.
//
// This line has to be HERE, above migrate(), for two separate reasons.
//
// One: the pragma is a silent no-op inside a transaction, and every
// migration runs inside withTransactionSync. So a migration physically
// cannot switch enforcement on for itself. Measured, not assumed — setting
// it inside tx() read back as 0, with no error thrown, and the setting was
// still 0 after the transaction closed. Discarded, not deferred.
//
// Two: switching enforcement on does not retroactively check rows that are
// already in the table. It only checks statements from this point forward.
// So any migration that runs before this line runs unchecked, permanently,
// with no way to audit it afterwards short of a full foreign_key_check sweep.
db.execSync('PRAGMA foreign_keys = ON;'); 

// Brings the database up to date, one transaction per step.
//
// The log lines are dev-only and they stay. Without them, a migration that
// ran and a migration that was skipped look exactly the same from outside:
// nothing on screen changes and nothing is printed.
//
// Each line prints AFTER withTransactionSync returns, never inside it.
// Inside, a step that threw would have announced itself before the rollback
// undid it. Same rule as the change counters: announce after it succeeded.
//
// The last line reads user_version back OUT of the file instead of trusting
// the number this loop just wrote. That is what makes it evidence rather
// than a claim — it reports what is in the database, not what the code
// meant to put there.
function migrate() {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current >= MIGRATIONS.length) {
    if (__DEV__) {
      console.log(`migrate: user_version ${current}, nothing to run`);
    }
    return;
  }

  for (let v = current; v < MIGRATIONS.length; v++) {
    const t0 = Date.now();
    db.withTransactionSync(() => {
      db.execSync(MIGRATIONS[v]);
      db.execSync(`PRAGMA user_version = ${v + 1};`);
    });
    if (__DEV__) {
      console.log(`migrate: ${v} -> ${v + 1} in ${Date.now() - t0}ms`);
    }
  }

  if (__DEV__) {
    const after = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
    console.log(`migrate: user_version is now ${after?.user_version ?? 0}`);
  }
}

migrate()



export function all<T>(sql: string, params: Param[] = []): T[] {
  return db.getAllSync<T>(sql, params);
}

export function run(sql: string, params: Param[] = []): void {
  db.runSync(sql, params);
}


// Runs everything inside fn as ONE transaction.
//
// You know transactions from Bytedash as an all-or-nothing guarantee.
// That's still true here. But the reason we need it today is speed.
//
// Every write on its own has to wait for the data to physically reach
// the phone's storage chip before it returns. That wait is a millisecond
// or two. Do it 5,000 times and you wait for minutes. Do all 5,000
// inside one transaction and you wait once.

export const tx = (fn: () => void) : void => db.withTransactionSync(fn)
