import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PALETTES, type Palette, type Scheme } from "@/theme/palette";

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
  /*
   * REQUIRED, and a prop rather than a useColorScheme() call in here — the
   * opposite of what comp/BottomSheet.tsx and comp/ExpenseForm.tsx do, for a
   * reason that is specific and checkable.
   *
   * Both of this component's callers already read the scheme, so a prop costs
   * nothing. And reading it in here would be actively wrong while
   * comp/CategorySheet.tsx is still a hardcoded black sheet: these rows would
   * turn dark the moment the phone went light, on a surface that stayed black,
   * and `text` on that sheet's card reads 1.00 — invisible, with nothing
   * thrown.
   *
   * Required rather than defaulted so the compiler names every caller. A
   * default of "dark" would let an unthemed caller keep compiling and keep
   * drawing dark, and nothing would say which ones were left.
   */
  scheme: Scheme;
};

export default function CategoryList({
  items,
  selectedId,
  onSelect,
  scheme,
}: Props) {
  const styles = STYLES[scheme];

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

/*
 * Built twice at module load, once per palette — the shape every themed file
 * in this project uses.
 */
function makeStyles(c: Palette) {
  return StyleSheet.create({
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
    // 14.52 on the dark box, 17.01 on the light one.
    rowName: { color: c.text, fontSize: 16, fontWeight: "500" },
    // The filter's counts and money. 5.24 dark, 5.07 light.
    rowNums: { color: c.textDim, fontSize: 14, fontVariant: ["tabular-nums"] },
    divider: {
      // 1dp, not StyleSheet.hairlineWidth. A hairline is 0.36dp on a Pixel 8,
      // and at this colour against the surface behind it the line is drawn
      // and not seen — the same pair that was already found invisible on the
      // period menu, which is where this 1dp line comes from.
      //
      // lineStrong, the LOUD divider, not line. It is the same #636366 in dark,
      // byte for byte. In light it becomes #A8A8AD and reads 2.37, where the
      // dark value left on a white box reads 5.99 — a hard black rule across a
      // white sheet, which is what it was doing before this change.
      height: 1,
      backgroundColor: c.lineStrong,
      // Matches the row's own paddingHorizontal, so the line starts where the
      // text starts rather than at the box's edge.
      marginHorizontal: 20,
    },
  });
}

const STYLES: Record<Scheme, ReturnType<typeof makeStyles>> = {
  dark: makeStyles(PALETTES.dark),
  light: makeStyles(PALETTES.light),
};