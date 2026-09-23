
import { readCategoryBreakdown, readTotals } from "@/db/expenses";
import { DEFAULT_CURRENCY, formatMoney } from "@et/shared";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import CategoryList, { CategoryListItem } from "./CategoryLListItem";

export type CategoryChoice = { id: string; name: string } | null;

type Props = {
  visible: boolean;
  // Which row gets the tick. null means "All categories".
  selectedId: string | null;
  onSelect: (choice: CategoryChoice) => void;
  onClose: () => void;
    // The sheet does not navigate. index.tsx does, because index owns
  // setSheetOpen and the close has to happen before the push.
  onManage: () => void;
};

export default function CategorySheet({
  visible,
  selectedId,
  onSelect,
  onClose,
  onManage
}: Props) {
  // The sheet no longer holds breakdown and totals separately. It holds the
  // finished list, because building that list is the only thing this
  // component does that the picker does not.
  const [items, setItems] = useState<CategoryListItem[]>([]);

  // Read when the sheet OPENS, not when it mounts. A Modal with
  // visible={false} is still mounted, so mount-time would give you numbers
  // from app launch — stale the moment you add an expense.
  useEffect(() => {
    if (!visible) return;

    // readTotals with NO argument. This is the grand total and it stays the
    // grand total no matter what the screen behind is filtered to.
    const grand = readTotals();
    const breakdown = readCategoryBreakdown();

    setItems([
      {
        // "All categories" is not a row in the categories table, so it has
        // no id. That null is what ticks it when no filter is applied —
        // CategoryList compares ids and never learns what "all" means.
        id: null,
        name: "All categories",
        trailing: `${grand.count}   ${formatMoney(grand.totalMinor, DEFAULT_CURRENCY)}`,
        dividerAfter: true,
      },
      ...breakdown.map((c) => ({
        id: c.id,
        name: c.name,
        // c.count is COUNT(e.id). Rent reads 0 here and is still on screen —
        // that pair is the whole point of 5f.
        trailing: `${c.count}   ${formatMoney(c.totalMinor, DEFAULT_CURRENCY)}`,
      })),
    ]);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      // Without this the modal paints its own opaque background and you
      // cannot see the list behind it. There is no "sheet" mode.
      transparent
      animationType="slide"
      // Android hardware/gesture back. Miss this prop and back tries to
      // leave the screen with the sheet still on top of it.
      onRequestClose={onClose}
      
    >
      <View style={styles.backdrop}>
        {/* Fills the whole modal and sits BEHIND the sheet, so a tap
            anywhere outside the panel closes it. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.sheet}>
                 <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Filter by category</Text>
          <Pressable onPress={onManage} hitSlop={10}>
            <Text style={styles.manage}>+ Add</Text>
          </Pressable>
        </View>
          <CategoryList
            items={items}
            selectedId={selectedId}
            // Translating back to CategoryChoice happens HERE, not in
            // CategoryList. app/index.tsx and applyFilter are untouched.
            onSelect={(item) =>
              onSelect(
                item.id === null ? null : { id: item.id, name: item.name },
              )
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // justifyContent pins the sheet to the bottom. The backdrop is the
  // full-screen parent; the sheet is its last child.
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#171B22",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    // Clears the gesture bar on tall phones without pulling in insets.
    paddingBottom: 28,
    maxHeight: "70%",
  },
  
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  // The padding moved up to sheetHeader. Leave it on both and the title
  // gets 40px of left inset while the + Add gets 20.
  sheetTitle: {
    color: "#8A8F98",
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  manage: { color: "#E5484D", fontSize: 14, fontWeight: "600" },
});