
import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './migrations';
// Our own parameter type — deliberately not expo-sqlite's.
// Nothing outside this file should import from 'expo-sqlite'.
 export type Param = string | number |null;

// DEV ONLY — comment out immediately after use.
// try {
//   SQLite.deleteDatabaseSync('expenses.db');
// } catch {
//   // nothing to delete, fine
// }


 const db = SQLite.openDatabaseSync('expenses.db')

 // Write-ahead log mode. Plain English: instead of editing the database
// file directly, SQLite appends changes to a side file first and folds
// them in later. Readers aren't blocked by a writer, and a crash
// mid-write can't leave you with a half-edited database.
// You'll meet this idea again at Milestone 11 — same concept, on Postgres.


db.execSync('PRAGMA journal_mode = WAL;');

function migrate() {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= MIGRATIONS.length) return;

  for (let v = current; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      db.execSync(MIGRATIONS[v]);
      db.execSync(`PRAGMA user_version = ${v + 1};`);
    });
  }
}

migrate()
export function all<T>(sql: string, params: Param[] = []): T[] {
  return db.getAllSync<T>(sql, params);
}

export function run(sql: string, params: Param[] = []): void {
  db.runSync(sql, params);
}

console.log('COLUMNS:', db.getAllSync('PRAGMA table_info(expenses)'));
console.log('VERSION:', db.getFirstSync('PRAGMA user_version'));


