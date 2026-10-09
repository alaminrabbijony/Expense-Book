import BottomSheet from "@/comp/BottomSheet";
import {
  ALL_ICON_VALUES,
  CategoryGlyph,
  DEFAULT_CATEGORY_ICON,
  parseIcon,
} from "@/comp/categoryIcon";
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
 * The icon catalog: every glyph in both installed fonts, in a sheet with a
 * search box.
 *
 * 1,357 Ionicons + 7,448 MaterialCommunityIcons = 8,805. Read at module
 * load from the fonts themselves, in comp/categoryIcon.tsx — there is no
 * hand-written list anywhere, so this cannot drift out of date when the
 * package moves, and a value that reaches the database is one a font can
 * definitely draw.
 *
 * Each entry holds the value that gets STORED and the bare glyph name that
 * gets SEARCHED, worked out once here rather than on every keystroke:
 *
 *   { value: "mci:rice",           name: "rice" }
 *   { value: "fast-food-outline",  name: "fast-food-outline" }
 *
 * Searching has to use the bare name. Against the stored value, typing "m"
 * would match every MaterialCommunityIcons glyph at once, because all 7,448
 * of them start with "mci:".
 */
const CHOICES = ALL_ICON_VALUES.map((value) => ({
  value,
  name: parseIcon(value).name,
}));

/* YOURS TO RESTYLE: how many icons fit across. */
const COLUMNS = 6;

/*
 * Tap feedback, the app's rule: Android ripples, iOS dims. The sheet behind
 * these is black, so the ripple is the light one.
 */
const RIPPLE = { color: "rgba(255,255,255,0.22)" };

type Props = {
  visible: boolean;
  /* The value picked so far, or null for "no icon". Drawn selected in the
   * grid, so reopening the sheet shows where you already are. */
  selected: string | null;
  /* The category's own colour pair, so an icon in this sheet looks exactly
   * the way it will look on the card once it is chosen. */
  color: string;
  tint: string;
  /* Hands back the value to STORE — "mci:rice", not "rice". A bare
   * MaterialCommunityIcons name would be read back as an Ionicons name,
   * find no glyph, and silently draw the grey receipt. */
  onPick: (value: string | null) => void;
  onClose: () => void;
};

/*
 * One icon in the grid.
 *
 * memo for the reason every list in this project uses it: a FlatList hands
 * each cell a brand-new renderItem wrapper every time it renders, and typing
 * in the search box renders it on every keystroke. With memo, a cell whose
 * props are unchanged does not run again.
 *
 * Every prop is a plain string or boolean, which is what lets memo's
 * Object.is comparison work. An object built in the parent would be a new
 * value every render and memo would never skip anything.
 */
const IconCell = memo(function IconCell({
  value,
  family,
  name,
  picked,
  color,
  tint,
  onPick,
}: {
  value: string;
  family: "ion" | "mci";
  name: string;
  picked: boolean;
  color: string;
  tint: string;
  onPick: (value: string) => void;
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
      /* The VALUE, with its prefix, not the display name. */
      onPress={() => onPick(value)}
    >
      {/* The picked one is drawn in the category's own colour, the rest in
          plain white. So the sheet shows what the choice will look like
          rather than only which cell is ticked. */}
      <CategoryGlyph
        family={family}
        name={name}
        size={26}
        color={picked ? color : "#ECEDEE"}
      />
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
   * A plain `includes`, not a prefix match: "back" should find
   * "arrow-back".
   */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q.length === 0 ? CHOICES : CHOICES.filter((c) => c.name.includes(q));
  }, [query]);

  return (
    <BottomSheet visible={visible} title="Choose an icon" onClose={onClose}>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        /* The count comes from the array, so it can never say a number the
         * fonts disagree with. */
        placeholder={`Search ${CHOICES.length} icons`}
        placeholderTextColor="#8E8E93"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />

      {/* Clearing the icon is not an icon, so it is not a cell in the grid.
          A cell would need a fake value in a list of real ones. */}
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
          {/* The same placeholder every card falls back to, from the one
              place that decides it. */}
          <CategoryGlyph
            family={DEFAULT_CATEGORY_ICON.family}
            name={DEFAULT_CATEGORY_ICON.name}
            size={20}
            color="#ECEDEE"
          />
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

        8,805 cells, and FlatList only builds the ones near the screen. It is
        6.5x what this grid used to hold, so the search box has stopped being
        a convenience.
      */}
      <FlatList
        style={styles.grid}
        data={shown}
        keyExtractor={(c) => c.value}
        numColumns={COLUMNS}
        keyboardShouldPersistTaps="handled"
        columnWrapperStyle={styles.gridRow}
        /* The picked value changes which cell draws itself selected, and it
         * is not part of `data`. Without this, the old cell would stay lit. */
        extraData={`${selected}|${color}`}
        ListEmptyComponent={
          <Text style={styles.empty}>No icon called “{query.trim()}”.</Text>
        }
        renderItem={({ item }) => (
          <IconCell
            value={item.value}
            family={parseIcon(item.value).family}
            name={item.name}
            picked={item.value === selected}
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