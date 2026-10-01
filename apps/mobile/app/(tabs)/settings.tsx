import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/*
 * Which edges the SafeAreaView pads. Not the bottom: the tab bar below this
 * screen already pads for the system navigation bar, and SafeAreaView pads
 * by the whole window's insets, not its own position. The full reason is
 * at SAFE_EDGES in comp/ExpenseListScreen.tsx.
 */
const SAFE_EDGES = ["top", "left", "right"] as const;

/* Empty for now. A likely home for the theme switch at 6e. */
export default function Settings() {
  return (
    <SafeAreaView style={styles.screen} edges={SAFE_EDGES}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Nothing here yet.</Text>
      </View>
    </SafeAreaView>
  );
}

// YOURS TO RESTYLE. The header matches the Categories screen's title.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#8A8F98", fontSize: 14 },
});
