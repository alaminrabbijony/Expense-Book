import ExpenseListScreen from "@/comp/ExpenseListScreen";

/* Home: this month's expenses, with the top card: the month, its total,
 * the ⋯ filter and a +. monthOnly is what limits the list, the total and
 * the ⋯ sheet to this month. */
export default function Home() {
  return <ExpenseListScreen screen="home" showTopCard monthOnly />;
}