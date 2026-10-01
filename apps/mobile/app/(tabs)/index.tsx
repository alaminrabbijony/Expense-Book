import ExpenseListScreen from "@/comp/ExpenseListScreen";

/* Home: the list with its top card — the total, the ⋯ filter and a +. */
export default function Home() {
  return <ExpenseListScreen screen="home" showTopCard />;
}
