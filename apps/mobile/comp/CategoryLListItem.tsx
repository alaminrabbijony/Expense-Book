import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

// id is nullable because ONE caller has a row that is not a category.
// The filter's "All categories" is an item with id: null — not a mode this
// component knows about. Nothing here branches on which caller it is.
export type CategoryListItem = {
  id: string | null;
  name: string;
  // Right-hand text. The filter passes counts and money; the picker passes
  // nothing, so nothing renders.
  trailing?: string;
  dividerAfter?: boolean;
};

type Props = {
  items: CategoryListItem[];
  // Whichever item's id matches gets the tick. null ticks the null item,
  // and ticks nothing in a list that has no null item.
  selectedId: string | null;
  onSelect: (item: CategoryListItem) => void;
};

export default function CategoryList({ items, selectedId, onSelect }: Props) {
  return (
    // A ScrollView, not a FlatList. A handful of rows needs no
    // virtualization, and decisions.md keeps FlatList out of the sheets.
    //
    // This file cannot make the list scroll on its own. A ScrollView only
    // scrolls when the views above it limit its height, and those views
    // belong to the callers. If a caller lets this grow to the full height
    // of its rows, nothing scrolls.
    <ScrollView
      style={styles.list}
      // The default is "never". With a text input focused and the on-screen
      // keyboard open, a tap on a row would only close the keyboard, and
      // the row would never get it. The add form has title and amount
      // inputs, so that is the normal case there. "handled" lets a row
      // that handles the tap keep it.
      keyboardShouldPersistTaps="handled"
    >
      {items.map((item) => (
        <View key={item.id ?? "__null_item__"}>
          <Pressable style={styles.row} onPress={() => onSelect(item)}>
            <Text style={styles.rowName}>
              {selectedId === item.id ? "✓  " : "     "}
              {item.name}
            </Text>
            {item.trailing ? (
              <Text style={styles.rowNums}>{item.trailing}</Text>
            ) : null}
          </Pressable>
          {item.dividerAfter ? <View style={styles.divider} /> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A ScrollView's built-in style has flexGrow: 1, so it would stretch into
  // any spare room a caller has and push whatever sits below it down. The
  // View this replaced stayed the height of its rows; flexGrow: 0 keeps
  // that. flexShrink: 1 still comes from the built-in style — it is what
  // lets the list get shorter than its rows, which is when it scrolls.
  list: { flexGrow: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  rowName: { color: "#ECEDEE", fontSize: 16, fontWeight: "500" },
  rowNums: { color: "#8A8F98", fontSize: 14, fontVariant: ["tabular-nums"] },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#22262E",
    marginHorizontal: 20,
  },
});