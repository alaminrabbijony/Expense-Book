import ExpenseForm from "@/comp/ExpenseForm";
import { insertExpense, listExpenses } from "@/db/expenses";
import { useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
type Expense = {
  id: string;
  title: string;
  category: string;
  currency: string;
  amountMinor: number;
  spentAt: string;
};

type Exp = {
  id: string;
  title: string;
  amountMinor: number;
};

const EXPENSES: Expense[] = [
  {
    id: "1",
    title: "Lunch — Chomchom",
    category: "Food",
    amountMinor: 12500,
    currency: "BDT",
    spentAt: "Today, 1:40 PM",
  },
  {
    id: "2",
    title: "Rickshaw to campus",
    category: "Transport",
    amountMinor: 4000,
    currency: "BDT",
    spentAt: "Today, 9:15 AM",
  },
  {
    id: "3",
    title: "Printing thesis draft",
    category: "Study",
    amountMinor: 18000,
    currency: "BDT",
    spentAt: "Yesterday",
  },
  {
    id: "4",
    title: "Tea, twice",
    category: "Food",
    amountMinor: 2000,
    currency: "BDT",
    spentAt: "Yesterday",
  },
  {
    id: "5",
    title: "Phone recharge",
    category: "Bills",
    amountMinor: 30000,
    currency: "BDT",
    spentAt: "2 days ago",
  },
];

const INITIAL_EXPENSES: Exp[] = [
  {
    id: "1",
    title: "Lunch — Chomchom",
    amountMinor: 12500,
  },
  {
    id: "2",
    title: "Rickshaw to campus",
    amountMinor: 4000,
  },
  {
    id: "3",
    title: "Printing thesis draft",
    amountMinor: 18000,
  },
  {
    id: "4",
    title: "Tea, twice",
    amountMinor: 2000,
  },
  {
    id: "5",
    title: "Phone recharge",
    amountMinor: 30000,
  },
];
// TODO(Milestone 4): this is wrong. Not every currency has 2 decimal places.
// JPY has 0, KWD has 3. Dividing by 100 is a bug, not a shortcut.
const formatBDT = (amountMinor: number) => {
  return "৳" + (amountMinor / 100).toFixed(2);
};

// const totalMinor = EXPENSES.reduce((sum, e) => sum + e.amountMinor, 0);

export default function Index() {
    // The function form runs ONCE, on first render — not on every render.
  const [expense, setExpense] = useState<Exp[]>(()=> listExpenses());

  const addExpense = (title: string, amountMinor: number) => {
   insertExpense(title, amountMinor)
   setExpense(listExpenses())
  };

  const totalMinor = expense.reduce((sum, e) => sum + e.amountMinor, 0)

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Spent Recently</Text>
        <Text style={styles.headerTotal}> {formatBDT(totalMinor)}</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={{ flex: 1 }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
        >
          {expense.map((e) => (
            <View key={e.id} style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>{e.title}</Text>
                {/* <Text style={styles.rowMeta}>
                {e.category} · {e.spentAt}
              </Text> */}
              </View>
              <Text style={styles.rowAmount}>{formatBDT(e.amountMinor)}</Text>
            </View>
          ))}
        </ScrollView>

        <ExpenseForm onAdd={addExpense} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F1115" },
  header: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16 },
  headerLabel: {
    color: "#8A8F98",
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  headerTotal: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "700",
    marginTop: 4,
  },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#22262E",
  },
  rowLeft: { flex: 1, paddingRight: 12 },
  rowTitle: { color: "#ECEDEE", fontSize: 16, fontWeight: "500" },
  rowMeta: { color: "#8A8F98", fontSize: 13, marginTop: 2 },
  rowAmount: {
    color: "#ECEDEE",
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
