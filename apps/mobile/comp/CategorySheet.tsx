import {
  readCategoryBreakdown,
  readCategoryBreakdownInRange,
  readTotals,
  readTotalsInRange,
} from "@/db/expenses";
import type { DateRange } from "@/db/expenses";
import { DEFAULT_CURRENCY, formatMoney } from "@et/shared";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import CategoryList, { CategoryListItem } from "./CategoryLListItem";
import { PALETTES, schemeOf, type Palette, type Scheme } from "@/theme/palette";

export type CategoryChoice = { id: string; name: string } | null;

type Props = {
  visible: boolean;
  /*
   * The stretch of time the screen behind is showing: this month on Home,
   * or null for every expense. Required, so a caller cannot forget it and
   * get all-time numbers under a month's total without a word.
   */
  range: DateRange | null;
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
  range,
  selectedId,
  onSelect,
  onClose,
  onManage
}: Props) {
  /*
   * Read here, not taken as a prop — and the deciding question is NOT "does
   * the parent already have it", which is what it looked like for the last
   * three files.
   *
   * The real test is whether this component could end up disagreeing with a
   * surface it does not own. comp/CategoryLListItem.tsx takes a prop because
   * it draws rows on SOMEONE ELSE'S box, and one of those boxes — this file,
   * until a minute ago — was still hardcoded dark. This component owns every
   * surface it touches, out to its own backdrop, so it cannot disagree with
   * anything.
   *
   * A required prop would be equally correct and costs a one-line edit to
   * comp/ExpenseListScreen.tsx, which is 3,763 lines. Not worth the handover.
   */
  const scheme = schemeOf(useColorScheme());
  const styles = STYLES[scheme];

  // The sheet no longer holds breakdown and totals separately. It holds the
  // finished list, because building that list is the only thing this
  // component does that the picker does not.
  const [items, setItems] = useState<CategoryListItem[]>([]);

    /*
     Read when the sheet opens, not when it mounts.
     On Android a hidden Modal renders nothing, so the list inside it
     unmounts. This component does not: index.tsx keeps rendering it and
     only flips `visible`. A mount-time read would run once at app launch,
     and be stale the moment an expense is added. The `if (!visible)`
     below is what makes it wait for the open. 
     */

  useEffect(() => {
    if (!visible) return;

    /*
     * The same stretch of time as the list and the total behind the sheet.
     * If they covered different times, "All categories" here would disagree
     * with the total the person just saw.
     *
     * Still NO category argument. "All categories" is the total for every
     * category, whatever the screen behind is filtered to.
     */
    const grand = range ? readTotalsInRange(range) : readTotals();
    const breakdown = range
      ? readCategoryBreakdownInRange(range)
      : readCategoryBreakdown();

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

    /* `range` is listed so an open sheet re-reads if the month moves under
     * it. The screen keeps it in state, so it is the same object on every
     * render until then. A new object each render would re-read on every
     * render while the sheet is open. */
  }, [visible, range]);

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
            // The lie that stood here for one session is gone. This file is
            // themed now, so the list gets the real scheme and its rows draw
            // on a surface that moves with them.
            scheme={scheme}
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

/*
 * Built twice at module load, once per palette — the shape every themed file
 * in this project uses.
 */
function makeStyles(c: Palette) {
  return StyleSheet.create({
    // justifyContent pins the sheet to the bottom. The backdrop is the
    // full-screen parent; the sheet is its last child.
    backdrop: {
      flex: 1,
      backgroundColor: c.scrim,
      justifyContent: "flex-end",
    },
    sheet: {
      /*
       * WAS #171B22 — the palette this project abandoned at Session 30, when
       * the add sheet became black. This file was never restyled, so the two
       * bottom sheets have been visibly different colours through Sessions
       * 31, 32, 33, 34, 35 and 36 — six of them — and nobody caught it,
       * because nobody opened this one.
       *
       * It is `page` now, the same as comp/BottomSheet.tsx, because it is the
       * same kind of object.
       */
      backgroundColor: c.page,
      /*
       * NEW, and it is mechanism rather than decoration — the same line
       * comp/BottomSheet.tsx has carried since Session 30, for the same reason.
       *
       * The old #171B22 had its own faint edge against the dimmed page (1.22),
       * so it never needed one. `page` does not: in dark the backdrop over a
       * black page is still black, so this sheet's edge reads 1.00 and the
       * corner radius draws nothing at all. In light the edge reads 5.54 on its
       * own and this line is decoration.
       */
      borderTopWidth: 1,
      borderTopColor: c.line,
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
      // The same token and the same size as comp/BottomSheet.tsx's title, so
      // the two sheets finally say their headings the same way.
      color: c.textDim,
      fontSize: 13,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    /*
     * dangerInk keeps this exactly the red it is today in dark, and darkens it
     * to #C62B30 in light where the bright red reads only 3.51 on a pale sheet.
     *
     * KNOWN ODDITY, not fixed here: this is the last red ACTION control in the
     * app. Session 30 deliberately took red off the add form's buttons — "+ Add"
     * is the same kind of control and was never looked at. Red now means an
     * error everywhere else. Changing it is a look, so it is Rabbi's.
     */
    manage: { color: c.dangerInk, fontSize: 14, fontWeight: "600" },
  });
}

const STYLES: Record<Scheme, ReturnType<typeof makeStyles>> = {
  dark: makeStyles(PALETTES.dark),
  light: makeStyles(PALETTES.light),
};