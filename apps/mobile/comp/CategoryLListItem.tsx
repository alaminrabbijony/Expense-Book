import { Pressable, StyleSheet, Text, View } from "react-native";

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
    <View>
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
    </View>
  );
}

const styles = StyleSheet.create({
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