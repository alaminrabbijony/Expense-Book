import ExpenseForm from "@/comp/ExpenseForm";
import {
  clearSeedExpenses,
  countRowSources,
  createListIndex,
  dropListIndex,
  explainListPage,
  insertExpense,
  listExpensePage,
  readTotals,
  readUserVersion,
  seedFakeExpenses,
  timePages,
} from "@/db/expenses";
import type { Expense } from "@/db/expenses";
import { asMinor, DEFAULT_CURRENCY, formatMoney, type Minor } from "@et/shared";
import { useRef, useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { probeForeignKeys } from "../db/expenses";

export default function Index() {
  // How many rows we have already pulled out of the database.
  // A REF, not state — onEndReached can fire twice before React
  // redraws, and state would still be showing the old number.
  const offsetRef = useRef(0);
  const [rows, setRows] = useState<Expense[]>(() => {
    const t0 = Date.now();
    const first = listExpensePage(0);
    console.log(`first page: ${first.length} rows in ${Date.now() - t0}ms`);
    offsetRef.current = first.length;
    return first;
  });

  const [totals, setTotals] = useState(() => readTotals());

  // Go back to page one and re-read the total.
  // Called after anything that changes the table.

  const reload = () => {
    const first = listExpensePage(0);
    offsetRef.current = first.length;
    setRows(first);
    setTotals(readTotals());
  };

  const loadMore = () => {
    // We already have every row. Nothing to fetch.
    if (offsetRef.current >= totals.count) {
      return;
    }

    const next = listExpensePage(offsetRef.current);
    // Bump the offset IMMEDIATELY, before React redraws anything.
    // This single line is what stops a second onEndReached from
    // re-reading the same page.
    offsetRef.current += next.length;
    // prev is whatever the list currently holds. React guarantees
    // it is up to date, even if this runs twice in a row.
    setRows((prev) => [...prev, ...next]);
  };

  /** 
  // The function form runs ONCE, on first render — not on every render.
  const [expense, setExpense] = useState<Expense[]>(() => {
    const t0 = Date.now();
    const rows = listExpenses();
    console.log(`listExpenses: ${rows.length} rows in ${Date.now() - t0}ms`);

    return rows;
  });
*/
  const addExpense = (title: string, amountMinor: Minor, currency: string) => {
    insertExpense(title, amountMinor, currency);
    reload();
  };
  /**
 * // Only valid because everything is BDT. Adding amounts in different
 * // currencies is meaningless — Milestone 12's problem, not today's.
  
const totalMinor = asMinor(
    expense.reduce((sum, e) => sum + e.amountMinor, 0),
  );

  */

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Spent Recently</Text>
        <Text style={styles.headerTotal}>
          {formatMoney(totals.totalMinor, DEFAULT_CURRENCY)}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(e) => e.id}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            <Text style={styles.footer}>
              Showing {rows.length} of {totals.count}
            </Text>
          }
          renderItem={({ item: e }) => (
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>{e.title}</Text>
              </View>
              <Text style={styles.rowAmount}>
                {formatMoney(e.amountMinor, e.currencyCode)}
              </Text>
            </View>
          )}
        />

        <ExpenseForm onAdd={addExpense} />

        {__DEV__ && (
          <View style={styles.devRow}>
            <Pressable
              style={styles.devButton}
              onPress={() => {
                const t0 = Date.now();
                seedFakeExpenses(50000);
                console.log(`seed: ${Date.now() - t0}ms`);
                reload();
              }}
            >
              {/* Label said 5000 while the call said 50000. Third time today
                  that a label outlived the code under it. */}
              <Text style={styles.devButtonText}>Seed 50k</Text>
            </Pressable>

            <Pressable
              style={styles.devButton}
              onPress={() => {
                clearSeedExpenses();
                reload();
              }}
            >
              <Text style={styles.devButtonText}>Clear seed</Text>
            </Pressable>

            <Pressable style={styles.devButton} onPress={explainListPage}>
              <Text style={styles.devButtonText}>Explain plan</Text>
            </Pressable>

            <Pressable style={styles.devButton} onPress={timePages}>
              <Text style={styles.devButtonText}>Time pages</Text>
            </Pressable>

            {/* These five were outside the guard. dropListIndex in a real
                user's hands is unrecoverable — there is no undo button. */}
            <Pressable style={styles.devButton} onPress={createListIndex}>
              <Text style={styles.devButtonText}>Add index</Text>
            </Pressable>

            <Pressable style={styles.devButton} onPress={dropListIndex}>
              <Text style={styles.devButtonText}>Drop index</Text>
            </Pressable>

            <Pressable style={styles.devButton} onPress={readUserVersion}>
              <Text style={styles.devButtonText}>Version</Text>
            </Pressable>

            <Pressable style={styles.devButton} onPress={probeForeignKeys}>
              <Text style={styles.devButtonText}>Probe FKs</Text>
            </Pressable>

            <Pressable style={styles.devButton} onPress={countRowSources}>
              <Text style={styles.devButtonText}>Count rows</Text>
            </Pressable>
          </View>
        )}
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

  footer: {
    color: "#8A8F98",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 16,
  },
  devRow: {
    flexDirection: "row",
    // Four buttons no longer fit on one line on the Realme. Without
    // this, the fourth is pushed off-screen and cannot be tapped.
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  devButton: {
    backgroundColor: "#22262E",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  devButtonText: { color: "#8A8F98", fontSize: 13 },
});
