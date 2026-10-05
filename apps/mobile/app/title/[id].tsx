import ExpenseListScreen from "@/comp/ExpenseListScreen";
import { readExpenseTitle } from "@/db/expenses";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/*
 * The title page's route: /title/<an expense's id>.
 *
 * This file sits outside app/(tabs), so the page opens OVER the tabs, on
 * the root stack, with no tab bar and so no +.
 *
 * The page itself is the list screen Home and All use, in title mode: the
 * same card, the same swipe Edit and Delete, the same Undo. This file only
 * turns the id into a title.
 */
export default function TitleRoute() {
  /*
   * useLocalSearchParams is typed by the generic below, not checked when the
   * app runs. So the typeof makes sure only a string reaches the read.
   */
  const { id } = useLocalSearchParams<{ id: string }>();

  /*
   * Read once, from the tapped expense. The title the page shows never
   * changes for its life, even if that very expense is renamed or deleted
   * on the page: the page goes on answering "which expenses are called
   * this?".
   */
  const [title] = useState(() =>
    typeof id === "string" ? readExpenseTitle(id) : null,
  );

  if (title === null) {
    /* The expense was deleted before the page could read it. */
    return (
      <SafeAreaView style={styles.screen}>
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
          <Text style={styles.emptyTitle}>This expense is gone😥</Text>
          <Text style={styles.emptyBody}>
            It was deleted. Go back and pick another.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return <ExpenseListScreen screen="title" showTopCard titleOnly={title} />;
}

/* YOURS TO RESTYLE. The same values as the list screen's bar and empty
 * text, so the gone page looks like the rest of the app. */
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