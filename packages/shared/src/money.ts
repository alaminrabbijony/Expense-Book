/**
 * Money is stored as integer minor units — 1250 means 12.50.
 *
 * This is not a style preference. SQLite has no NUMERIC/DECIMAL storage class,
 * so an exact decimal cannot exist on-device. Integers are the only
 * representation that is exact on both SQLite and Postgres and survives the
 * sync boundary without conversion.
 *
 * PLACEHOLDER — currency handling and rounding rules get designed properly
 * in the schema session. Do not build on the formatting helper yet.
 */

declare const brand: unique symbol;

/** An integer number of minor units. Branded so a raw number can't sneak in. */
export type Minor = number & { readonly [brand]: 'Minor' };

export function toMinor(value: number): Minor {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Minor units must be an integer, got ${value}`);
  }
  return value as Minor;
}

/** Lossy on purpose — display only. Never feed the result back into arithmetic. */
export function formatMinor(value: Minor, exponent = 2): string {
  return (value / 10 ** exponent).toFixed(exponent);
}
