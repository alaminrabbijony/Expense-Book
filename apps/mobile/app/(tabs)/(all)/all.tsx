import ExpenseListScreen from "@/comp/ExpenseListScreen";

/*
 * All expenses: the same list without the top card, under its own bar with a
 * back button. A second copy of the screen, with its own rows and total.
 */
export default function AllExpenses() {
  return <ExpenseListScreen screen="all" showTopCard={false} />;
}
