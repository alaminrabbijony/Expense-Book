/**
 * Each entry upgrades the database by exactly one version.
 * The array index IS the version number it upgrades FROM.
 *
 *   MIGRATIONS[0]  takes the DB from version 0 -> 1
 *   MIGRATIONS[1]  takes the DB from version 1 -> 2
 *
 * So MIGRATIONS.length is always the version the code expects.
 * Never edit an entry that has already shipped. Only append.
 */

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
];
