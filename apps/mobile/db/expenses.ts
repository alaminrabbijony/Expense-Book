import { asMinor, type Minor } from "@et/shared";
import { all, run } from ".";

export type Expense = {
  id: string;
  title: string;
  amountMinor: Minor;
  currencyCode: string;
  createdAt: number;
};

// What SQLite actually hands back: snake_case, exactly as declared.
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
    // The read boundary. SQLite hands back an untyped number and this
    // is the only place it becomes Minor. A stored float throws here,
    // loudly, instead of being rounded away by the display.
    amountMinor: asMinor(row.amount_minor),
    currencyCode: row.currency_code,
    createdAt: row.created_at,
  };
};

export const listExpenses = (): Expense[] => {
  const rows = all<ExpenseRow>(
    `SELECT id, title, amount_minor, currency_code, created_at
       FROM expenses
      ORDER BY created_at DESC, id DESC`,
  );
  return rows.map(toExpense);
};

export const insertExpense = (
  title: string,
  amountMinor: Minor,
  currencyCode: string,
): Expense => {
  const expense: Expense = {
    // TODO(Milestone 7): must become a real UUID once a second device
    // can also create expenses. Fine while there's exactly one source of IDs.
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    currencyCode,
    amountMinor,
    createdAt: Date.now(),
  };

  run(
    `INSERT INTO expenses (id, title, amount_minor, currency_code, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [expense.id, expense.title, expense.amountMinor, expense.currencyCode, expense.createdAt],
  );

  return expense;
};
export const debugAmountTypes = () => {
  const rows = all<{
    id: string;
    title: string;
    amount_minor: number;
    t: string;
    currency_code: string;
  }>(
    `SELECT id, title, amount_minor, typeof(amount_minor) AS t, currency_code
       FROM expenses
      ORDER BY created_at DESC, id DESC`,
  );
  console.log(JSON.stringify(rows, null, 2));
};
