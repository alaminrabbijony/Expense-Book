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

export const toMinor = (input: string, currency: string): number | null => {
  const value = Number(input.trim());
  if (!Number.isFinite(value) || value <= 0) return null;

  return Math.round(value * 10 ** info(currency).digits); // 10^2 or 10^digits
};

// 435 -> "৳4.35"

export const formatMoney = (amountMinor: number, currency: string): string => {
  const { digits, symbol } = info(currency);
  return symbol + (amountMinor / 10 ** digits).toFixed(digits);
};
