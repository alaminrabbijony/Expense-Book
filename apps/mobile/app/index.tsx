import ExpenseForm from "@/comp/ExpenseForm";
import { insertExpense, listExpenses, debugAmountTypes } from "@/db/expenses";
import { formatMoney, DEFAULT_CURRENCY } from "@/helpers/helper";
import type { Expense } from "@/db/expenses";
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

export default function Index() {
  // The function form runs ONCE, on first render — not on every render.
  const [expense, setExpense] = useState<Expense[]>(() => {
    debugAmountTypes();
    return listExpenses();
  });

  const addExpense = (title: string, amountMinor: number, currency: string) => {
    insertExpense(title, amountMinor, currency);
    setExpense(listExpenses());
  };

  // Only valid because everything is BDT. Adding amounts in different
  // currencies is meaningless — Milestone 12's problem, not today's.
  const totalMinor = expense.reduce((sum, e) => sum + e.amountMinor, 0);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Spent Recently</Text>
        <Text style={styles.headerTotal}>
          {formatMoney(totalMinor, DEFAULT_CURRENCY)}
        </Text>
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
              </View>
              <Text style={styles.rowAmount}>
                {formatMoney(e.amountMinor, e.currencyCode)}
              </Text>
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
  rowAmount: {
    color: "#ECEDEE",
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});