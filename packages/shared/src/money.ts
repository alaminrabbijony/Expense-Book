// Everything about money lives here.
//
// digits = how many digits the subunit takes. BDT has 100 paisa in a
// taka, so 2. This is a property OF THE CURRENCY, not a constant —
// which is why it lives in a table instead of being typed inline.
// Only BDT is listed because only BDT can be entered. Milestone 12
// adds the picker; adding a currency is adding a line here.

type CurrencyInfo = { digits: number; symbol: string };

const CURRENCIES: Record<string, CurrencyInfo> = {
  BDT: { digits: 2, symbol: "৳" },
};

export const DEFAULT_CURRENCY = "BDT";

// Throw rather than assume 2. Assuming is how ¥100 gets stored as
// 10000 yen — silently, with nothing on screen to tell you.

const info = (code: string): CurrencyInfo => {
  const found = CURRENCIES[code];
  if (!found) throw new Error(`Unknown currency: ${code}`);
  return found;
};

// ---------------------------------------------------------------
// The brand
// ---------------------------------------------------------------

declare const brand: unique symbol;

/** An integer count of minor units. 1250 means 12.50 in a 2-digit currency. */
export type Minor = number & { readonly [brand]: "Minor" };

/**
 * Stamp a plain number as Minor.
 * Use this at the SQLite read boundary, where rows come back as
 * untyped numbers. Throws if the value is not whole.
 */

export const asMinor = (value: number): Minor => {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Minor units must be a whole number, got ${value}`);
  }
  return value as Minor;
};

// ---------------------------------------------------------------
// Parsing and formatting
// ---------------------------------------------------------------

// Keeps only digits, at most one dot, and no more decimals than the
// currency actually has.

export const sanitizeAmount = (next: string, currency: string): string => {
  const { digits } = info(currency);

  let cleaned = next.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");

  if (dot !== -1) {
    // A currency with no subunit has no use for a decimal point.
    if (digits === 0) {
      return cleaned.slice(0, dot);
    }

    const head = cleaned.slice(0, dot + 1);
    const tail = cleaned
      .slice(dot + 1)
      .replace(/\./g, "")
      .slice(0, digits);
    cleaned = head + tail;
  }

  return cleaned;
};

// "4.35" -> 435. Null means "not a usable amount yet" — still typing,
// or empty, or zero.

export const toMinor = (input: string, currency: string): Minor | null => {
  const value = Number(input.trim());
  if (!Number.isFinite(value) || value <= 0) return null;

  return asMinor(Math.round(value * 10 ** info(currency).digits));
};

// 435 -> "৳4.35"
// TODO(4b phase 2): tighten amountMinor from number to Minor.

export const formatMoney = (amountMinor: Minor, currency: string): string => {
  const { digits, symbol } = info(currency);
  return symbol + (amountMinor / 10 ** digits).toFixed(digits);
};