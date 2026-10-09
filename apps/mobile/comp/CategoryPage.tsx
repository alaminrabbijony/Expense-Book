import ExpenseListScreen from "@/comp/ExpenseListScreen";
import { readCategoryDetail } from "@/db/expenses";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/*
 * The body of the category page: /category/<a category's id>.
 *
 * It lives in comp/ for the same reason comp/TitlePage.tsx does: a route file
 * is a one-line re-export, and only one copy of the body can drift.
 *
 * Only the Categories tab renders it today, so there is one route. The title
 * page has two, one per tab stack, because a card on Home and a card on All
 * both open one.
 *
 * The page itself is the list screen Home, All and the title page use, in
 * category mode: the same card, the same swipe Edit and Delete, the same Undo,
 * and the same This month / This year / All time menu on its ⋯. This file only
 * decides whether the page can open at all.
 */
export default function CategoryPage() {
  /*
   * useLocalSearchParams is typed by the generic below, not checked when the
   * app runs. So the typeof makes sure only a string reaches the read.
   */
  const { id } = useLocalSearchParams<{ id: string }>();

  /*
   * Does this category exist? That is the only question asked here.
   *
   * Read once, at mount, and never again — a page opened on a category that
   * was deleted a moment earlier has nothing to show, and that cannot change
   * while this page is open.
   *
   * The list screen reads the SAME row again, and keeps re-reading it: the
   * name and the icon are both editable on this page, so its card has to
   * follow them. Two lookups at mount, both by PRIMARY KEY, which SQLite
   * answers by going straight to the row.
   */
  const [exists] = useState(() =>
    typeof id === "string" ? readCategoryDetail(id) !== null : false,
  );

  /*
   * No holdAddSheetTitle here, unlike the title page.
   *
   * That holder carries a TITLE for the add sheet to pre-fill, and a category
   * has none to offer. So the tab bar's + opens an empty form on this page,
   * which is what it does everywhere except a title page.
   */

  if (!exists || typeof id !== "string") {
    /* The category was deleted before the page could read it. */
    return (
      <SafeAreaView style={styles.screen} edges={SAFE_EDGES}>
        <StatusBar barStyle="light-content" />
        <View style={styles.bar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Text style={styles.barBack}>‹</Text>
          </Pressable>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>This category is gone</Text>
          <Text style={styles.emptyBody}>
            It was deleted. Its expenses moved to Uncategorised.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return <ExpenseListScreen screen="category" showTopCard categoryOnly={id} />;
}

/*
 * No "bottom", unlike comp/TitlePage.tsx's gone screen. SafeAreaView pads by
 * its provider's insets, not by where the view sits, and the tab bar below
 * this page already pads for the system navigation bar.
 */
const SAFE_EDGES = ["top", "left", "right"] as const;

/* YOURS TO RESTYLE. The same values as the list screen's bar and empty text,
 * so the gone page looks like the rest of the app. */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  barBack: { color: "#ECEDEE", fontSize: 30, fontWeight: "300", marginTop: -6 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: "#ECEDEE", fontSize: 17, fontWeight: "600" },
  emptyBody: { color: "#8A8F98", fontSize: 14, marginTop: 6 },
});