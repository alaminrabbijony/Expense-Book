import BottomSheet from "@/comp/BottomSheet";
import CategorySheet, { type CategoryChoice } from "@/comp/CategorySheet";
import ExpenseForm from "@/comp/ExpenseForm";
import {
  clearSeedExpenses,
  countRowSources,
  createCategoryCompositeIndex,
  createCategoryIndex,
  createListIndex,
  dropCategoryIndexes,
  dropListIndex,
  explainFilteredPlans,
  explainListPage,
  insertExpense,
  listExpensePage,
  listIndexes,
  probeCategoryFkOnInsert,
  probeForeignKeys,
  readTotals,
  readUserVersion,
  seedFakeExpenses,
  timeCategoryReads,
  timeFilteredPages,
  timePages,
} from "@/db/expenses";
import type { Expense } from "@/db/expenses";
import { DEFAULT_CURRENCY, formatMoney, type Minor } from "@et/shared";
import { useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";



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

  // null means no filter. Holds the name too, so the header can show it
  // without a second lookup.
  const [filter, setFilter] = useState<CategoryChoice>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Go back to page one and re-read the total, keeping whatever filter
  // is currently applied. Called after anything that changes the table.
  //
  // Safe to read `filter` from state here: reload only ever runs from an
  // event handler, after the render that set it.
  const reload = () => {
    const categoryId = filter?.id;

    const first = listExpensePage(0, categoryId);
    offsetRef.current = first.length;
    setRows(first);
    setTotals(readTotals(categoryId));
  };

  // Switch filter. Takes the choice as an ARGUMENT, never from state —
  // setFilter below does not update `filter` until the next render, so
  // reading it back here would apply the previous tap's category.
  const applyFilter = (choice: CategoryChoice) => {
    const categoryId = choice?.id;

    const first = listExpensePage(0, categoryId);
    // Page one of a different set. The offset MUST go back to zero, or
    // switching from food to rent asks for rows 300-350 of a set with none.
    offsetRef.current = first.length;
    // REPLACE, never append. Appending leaves food's rows above rent's.
    setRows(first);
    // The header total narrows with the list. A list showing one category
    // above a total showing everything is a screen that lies quietly.
    setTotals(readTotals(categoryId));

    setFilter(choice);
    setSheetOpen(false);
  };

  const loadMore = () => {
    // totals.count is the FILTERED count, so this guard already knows when
    // it has reached the end of rent's 0 rows.
    if (offsetRef.current >= totals.count) {
      return;
    }

    // The filter has to reach here too. Miss it and scrolling to the bottom
    // of food quietly starts appending uncategorised rows underneath.
    const next = listExpensePage(offsetRef.current, filter?.id);
    offsetRef.current += next.length;
    setRows((prev) => [...prev, ...next]);
  };

  const addExpense = (
    title: string,
    amountMinor: Minor,
    currency: string,
    categoryId: string,
  ) => {
    insertExpense(title, amountMinor, currency,categoryId);

    // Clear the filter instead of calling reload().
    //
    // Every new expense is uncategorised until 5h. So adding one while
    // filtered to food inserts a row you cannot see, the modal closes, and
    // nothing on screen moves. It looks broken and it is not.
    //
    // applyFilter(null) already resets the offset, replaces the rows and
    // re-reads the total, so this is reload() plus dropping the filter.
    applyFilter(null);

    setFormOpen(false);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {/* numberOfLines is what actually truncates. flex: 1 alone just
              gives the text room, and a long name would wrap to a second
              line and push the total down. */}
          <Text style={styles.headerLabel} numberOfLines={1}>
            {filter ? filter.name : "Spent Recently"}
          </Text>

          {/* The 3-dot. When the week filter arrives it opens a small menu
              first, and this becomes onPress={() => setMenuOpen(true)}. */}
          <Pressable onPress={() => setSheetOpen(true)} hitSlop={12}>
            <Text style={styles.dots}>⋯</Text>
          </Pressable>
        </View>

        <Text style={styles.headerTotal}>
          {formatMoney(totals.totalMinor, DEFAULT_CURRENCY)}
        </Text>
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <Text style={styles.footer}>
            Nothing in {filter ? filter.name : "this list"} yet.
          </Text>
        }
        // Both Empty and Footer render when there is no data, so an empty
        // filter would stack "Nothing in rent yet." above "Showing 0 of 0".
        ListFooterComponent={
          rows.length > 0 ? (
            <Text style={styles.footer}>
              Showing {rows.length} of {totals.count}
            </Text>
          ) : null
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
          {/* These five were outside the guard until Session 10.
              dropListIndex in a real user's hands is unrecoverable. */}
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
          <Pressable style={styles.devButton} onPress={listIndexes}>
            <Text style={styles.devButtonText}>listIndexes</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={explainFilteredPlans}>
            <Text style={styles.devButtonText}>explainFilteredPlans</Text>
          </Pressable>{" "}
          <Pressable style={styles.devButton} onPress={timeFilteredPages}>
            <Text style={styles.devButtonText}>timeFilteredPages</Text>
          </Pressable>{" "}
          <Pressable style={styles.devButton} onPress={createCategoryIndex}>
            <Text style={styles.devButtonText}>createCategoryIndex</Text>
          </Pressable>{" "}
          <Pressable
            style={styles.devButton}
            onPress={createCategoryCompositeIndex}
          >
            <Text style={styles.devButtonText}>
              createCategoryCompositeIndex
            </Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={dropCategoryIndexes}>
            <Text style={styles.devButtonText}>dropCategoryIndexes</Text>
          </Pressable>

                    <Pressable style={styles.devButton} onPress={probeCategoryFkOnInsert}>
            <Text style={styles.devButtonText}>FK on insert</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={timeCategoryReads}>
            <Text style={styles.devButtonText}>Time category reads</Text>
          </Pressable>
        </View>
      )}

      {/* Floats over the list. Last in the tree so it draws on top of the
          rows without needing zIndex. */}
      <Pressable style={styles.fab} onPress={() => setFormOpen(true)}>
        <Text style={styles.fabPlus}>+</Text>
      </Pressable>

      <CategorySheet
        visible={sheetOpen}
        selectedId={filter?.id ?? null}
        onSelect={applyFilter}
        onClose={() => setSheetOpen(false)}
      />

      <BottomSheet
        visible={formOpen}
        title="New expense"
        onClose={() => setFormOpen(false)}
      >
        <ExpenseForm onAdd={addExpense} />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F1115" },
  header: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16 },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLabel: {
    color: "#8A8F98",
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    // Gives the label room so it does not squeeze the dots. The
    // truncation itself is numberOfLines on the Text, not this.
    flex: 1,
  },
  dots: { color: "#8A8F98", fontSize: 20, paddingHorizontal: 4 },
  headerTotal: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "700",
    marginTop: 4,
  },

  // Was 40. The FAB floats over the bottom-right corner, so the last row
  // needs clearance or it sits under the button and cannot be read.
  list: { paddingHorizontal: 20, paddingBottom: 100 },
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

  fab: {
    position: "absolute",
    right: 20,
    // The dev row occupies the bottom of the screen and wraps to three
    // lines on a narrow phone. Raise this if they overlap on the Realme —
    // the emulator is wider and will not show you the problem.
    bottom: __DEV__ ? 140 : 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E5484D",
    alignItems: "center",
    justifyContent: "center",
    // Two shadow systems. Android reads elevation and ignores the rest;
    // iOS is the other way round. Both are here so it lifts on both.
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabPlus: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "300",
    // Android pads text vertically with invisible space, which pushes the
    // glyph below the centre of a circle. Android-only, no effect on iOS.
    includeFontPadding: false,
    // The font's baseline is not the shape's centre, so it still sits low.
    marginTop: -2,
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
