import { all, run } from ".";

export type Expense = {
  id: string;
  title: string;
  amountMinor: number;
  createdAt: number;
};

// What SQLite actually hands back: snake_case, exactly as declared.
type ExpenseRow = {
  id: string;
  title: string;
  amount_minor: number;
  created_at: number;
};

const toExpense = (row: ExpenseRow): Expense => {
  return {
    id: row.id,
    title: row.title,
    amountMinor: row.amount_minor,
    createdAt: row.created_at,
  };
};


export const listExpenses = (): Expense [] => {
      const rows = all<ExpenseRow>(
    `SELECT id, title, amount_minor, created_at
       FROM expenses
      ORDER BY created_at DESC, id DESC`
  );
  return rows.map(toExpense);
}

export const insertExpense = (title: string, amountMinor: number): Expense => {
      const expense: Expense = {
    // TODO(Milestone 7): must become a real UUID once a second device
    // can also create expenses. Fine while there's exactly one source of IDs.
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    amountMinor,
    createdAt: Date.now(),
  };

  run(
    `INSERT INTO expenses (id, title, amount_minor, created_at)
     VALUES (?, ?, ?, ?)`,
    [expense.id, expense.title, expense.amountMinor, expense.createdAt]
  );

  return expense;
}