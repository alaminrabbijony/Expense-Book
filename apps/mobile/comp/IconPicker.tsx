import BottomSheet from "@/comp/BottomSheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/*
 * The icon catalog: every glyph the installed Ionicons font has, in a sheet
 * with a search box.
 *
 * Read ONCE at module load, from the font itself. There is no hand-written
 * list anywhere, so this cannot drift out of date when the package moves, and
 * a name that reaches the database is a name the font can definitely draw.
 *
 * getRawGlyphMap is the typed way to ask. The font also has hasIcon(), which
 * exists in the JavaScript and is missing from the published typings.
 *
 * 1,357 names at 15.1.1 [V, read from the package's own glyph map].
 * Sorted, so base and -outline land next to each other ("book",
 * "book-outline", "book-sharp") and the order never changes between opens.
 */
const GLYPHS = Ionicons.getRawGlyphMap();
type IoniconName = keyof typeof GLYPHS;
const ICON_NAMES = (Object.keys(GLYPHS) as IoniconName[]).sort();

/* YOURS TO RESTYLE: how many icons fit across. */
const COLUMNS = 6;

/* The icon a category with none shows, the same one the cards fall back to. */
const NO_ICON = "receipt-outline" as const;

/*
 * Tap feedback, the app's rule: Android ripples, iOS dims. The sheet behind
 * these is black, so the ripple is the light one.
 */
const RIPPLE = { color: "rgba(255,255,255,0.22)" };

type Props = {
  visible: boolean;
  /* The name picked so far, or null for "no icon". Drawn selected in the
   * grid, so reopening the sheet shows where you already are. */
  selected: string | null;
  /* The category's own colour pair, so an icon in this sheet looks exactly
   * the way it will look on the card once it is chosen. */
  color: string;
  tint: string;
  onPick: (name: string | null) => void;
  onClose: () => void;
};

/*
 * One icon in the grid.
 *
 * memo for the reason every list in this project uses it: a FlatList hands
 * each cell a brand-new renderItem wrapper every time it renders, and typing
 * in the search box renders it on every keystroke. With memo, a cell whose
 * four props are unchanged does not run again.
 *
 * All four props are plain strings or booleans, which is what lets memo's
 * Object.is comparison work. An object built in the parent would be a new
 * value every render and memo would never skip anything.
 */
const IconCell = memo(function IconCell({
  name,
  picked,
  color,
  tint,
  onPick,
}: {
  name: IoniconName;
  picked: boolean;
  color: string;
  tint: string;
  onPick: (name: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      android_ripple={RIPPLE}
      style={({ pressed }) => [
        styles.cell,
        picked && { backgroundColor: tint },
        Platform.OS === "ios" && pressed ? styles.iosPressed : null,
      ]}
      onPress={() => onPick(name)}
    >
      {/* The picked one is drawn in the category's own colour, the rest in
          plain white. So the sheet shows what the choice will look like
          rather than only which cell is ticked. */}
      <Ionicons name={name} size={26} color={picked ? color : "#ECEDEE"} />
    </Pressable>
  );
});

export default function IconPicker({
  visible,
  selected,
  color,
  tint,
  onPick,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");

  /*
   * The filtered list, rebuilt only when the typing changes.
   *
   * useMemo and not a plain filter in the body: the array is what FlatList
   * compares to decide whether its data changed, and a new array on every
   * render would make it rebuild its cells for nothing.
   *
   * Every glyph name is already lower case, so only the query is folded.
   * A plain `includes`, not a prefix match: "arrow" should find
   * "chevron-back" nothing, but "back" should find "arrow-back".
   */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q.length === 0 ? ICON_NAMES : ICON_NAMES.filter((n) => n.includes(q));
  }, [query]);

  return (
    <BottomSheet visible={visible} title="Choose an icon" onClose={onClose}>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder={`Search ${ICON_NAMES.length} icons`}
        placeholderTextColor="#8E8E93"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />

      {/* Clearing the icon is not an icon, so it is not a cell in the grid.
          A cell would need a fake name in a typed list of real ones. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="No icon"
        android_ripple={RIPPLE}
        style={({ pressed }) => [
          styles.noneRow,
          selected === null && styles.noneRowPicked,
          Platform.OS === "ios" && pressed ? styles.iosPressed : null,
        ]}
        onPress={() => onPick(null)}
      >
        <View style={styles.noneCircle}>
          <Ionicons name={NO_ICON} size={20} color="#ECEDEE" />
        </View>
        <Text style={styles.noneText}>No icon</Text>
      </Pressable>

      {/*
        THE HEIGHT ON THIS LIST IS MECHANISM, NOT LOOKS.

        The sheet is as tall as what is inside it, and a FlatList inside
        something with no height of its own has nothing to be shorter than —
        it collapses and nothing scrolls. The number is what gives it a size
        to scroll inside. The add form's category picker solves the same
        problem with maxHeight: 220 on the box around it.

        keyboardShouldPersistTaps: the search box above has the keyboard up,
        and under the default the first tap on any icon would only close the
        keyboard. The icon would never receive it.

        1,357 cells, and FlatList only builds the ones near the screen.
      */}
      <FlatList
        style={styles.grid}
        data={shown}
        keyExtractor={(name) => name}
        numColumns={COLUMNS}
        keyboardShouldPersistTaps="handled"
        columnWrapperStyle={styles.gridRow}
        /* The picked name changes which cell draws itself selected, and it is
         * not part of `data`. Without this, the old cell would stay lit. */
        extraData={`${selected}|${color}`}
        ListEmptyComponent={
          <Text style={styles.empty}>No icon called “{query.trim()}”.</Text>
        }
        renderItem={({ item }) => (
          <IconCell
            name={item}
            picked={item === selected}
            color={color}
            tint={tint}
            onPick={onPick}
          />
        )}
      />
    </BottomSheet>
  );
}

/* YOURS TO RESTYLE — everything here except the grid's height, which is
 * explained where it is used. The colours are the add sheet's: a black sheet
 * with #1C1C1E fields. */
const styles = StyleSheet.create({
  search: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 0,
    backgroundColor: "#1C1C1E",
    color: "#ECEDEE",
    fontSize: 16,
  },

  noneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  noneRowPicked: { backgroundColor: "#2C2C2E" },
  noneCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2C2C2E",
    alignItems: "center",
    justifyContent: "center",
  },
  noneText: { color: "#ECEDEE", fontSize: 16, fontWeight: "500" },

  grid: { height: 360, marginTop: 12 },
  /* flex-start, so a last row holding two icons leaves them on the left
   * instead of spreading them across the sheet. */
  gridRow: { justifyContent: "flex-start" },
  cell: {
    width: 52,
    height: 52,
    margin: 4,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    /* Keeps the Android ripple inside the rounded corners. */
    overflow: "hidden",
  },
  empty: { color: "#8A8F98", fontSize: 14, paddingVertical: 24 },

  /* iOS only. Android shows its ripple instead. */
  iosPressed: { opacity: 0.6 },
});