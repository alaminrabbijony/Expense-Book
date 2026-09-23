import { Pressable, StyleSheet, Text, View } from "react-native";

// Deliberately NOT CategoryListItem from CategoryLListItem.tsx.
//
// That type carries id: string | null, because the filter sheet has an
// "All categories" row that is not a category. Every row here IS a real
// row in the categories table, so id is a plain string and nothing in this
// file has to ask whether it might be null.
export type ManageItem = { id: string; name: string };

type Props = {
  items: ManageItem[];
  // Which row is currently loaded into the field at the top. Its name is
  // struck through and it shows no buttons, because its controls moved up
  // there. null means nothing is being edited.
  editingId: string | null;
  // The row that gets no delete button. The parent passes UNCATEGORISED_ID.
  //
  // Taken as a prop rather than imported, so this component never reaches
  // into db/. deleteCategory throws on that id anyway — the hidden button
  // is the experience, the throw is the guarantee.
  undeletableId: string;
  onEdit: (item: ManageItem) => void;
  onDelete: (item: ManageItem) => void;
};

export default function CategoryManageList({
  items,
  editingId,
  undeletableId,
  onEdit,
  onDelete,
}: Props) {
  return (
    <View>
      {items.map((item) => {
        const editing = editingId === item.id;

        return (
          <View key={item.id} style={styles.row}>
            <Text
              style={[styles.name, editing && styles.nameEditing]}
              numberOfLines={1}
            >
              {item.name}
            </Text>

            {/* While a row is being edited its buttons disappear, because
                the field at the top is now driving it. Other rows keep
                theirs — tapping Edit on another row just switches which
                one the field holds. */}
            {editing ? null : (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => onEdit(item)}
                  hitSlop={8}
                  style={styles.action}
                >
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>

                {item.id === undeletableId ? null : (
                  <Pressable
                    onPress={() => onDelete(item)}
                    hitSlop={8}
                    style={styles.action}
                  >
                    <Text style={[styles.actionText, styles.deleteText]}>
                      Delete
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#22262E",
  },
  // flex: 1 gives the name the leftover room so it truncates instead of
  // squeezing the two buttons. numberOfLines on the Text does the cutting.
  name: { color: "#ECEDEE", fontSize: 16, fontWeight: "500", flex: 1, paddingRight: 12 },
  nameEditing: {
    textDecorationLine: "line-through",
    color: "#8A8F98",
  },
  actions: { flexDirection: "row", gap: 16 },
  action: { paddingVertical: 2 },
  actionText: { color: "#8A8F98", fontSize: 14, fontWeight: "500" },
  deleteText: { color: "#E5484D" },
});