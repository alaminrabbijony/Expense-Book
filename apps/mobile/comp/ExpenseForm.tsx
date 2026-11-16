import {
  insertCategory,
  readCategories,
  suggestCategory,
  UNCATEGORISED_ID,
  type Category,
  type ExpenseForEdit,
} from "@/db/expenses";
import {
  DEFAULT_CURRENCY,
  type Minor,
  sanitizeAmount,
  toMinor,
} from "@et/shared";
import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { PALETTES, schemeOf, type Palette, type Scheme } from "@/theme/palette";
import CategoryList from "./CategoryLListItem";
import { toInput } from "../../../packages/shared/src/money";

type Props = {
  /**
   * An existing expense to edit, or null/undefined to add a new one.
   *
   * Read ONCE, when this component mounts. The parent closes the sheet by
   * hiding a Modal, and a hidden Modal renders null, which unmounts this
   * component and throws its state away. So every open is a fresh mount and
   * this prop is read fresh every time.
   */
  initial?: ExpenseForEdit | null;
  /**
   * A title to start a NEW expense with, when the sheet was opened from a
   * title page. Null or absent means an empty form.
   *
   * Its own prop rather than a half-filled `initial`, because `initial`
   * feeds four initialisers, not one: the amount field only starts empty
   * while `initial` is absent, so an object carrying just a title would put
   * an invented number in the amount.
   *
   * Ignored while editing. `initial` describes a row that already exists,
   * and its own title is the right one.
   */
  initialTitle?: string | null;
  /** Text on the submit button. "Add expense" or "Save". */
  submitLabel: string;
  onSubmit: (
    title: string,
    amountMinor: Minor,
    currency: string,
    categoryId: string,
  ) => void;
};

export default function ExpenseForm({
  initial,
  initialTitle,
  submitLabel,
  onSubmit,
}: Props) {
  /*
   * Read here rather than taken as a prop, for the same reason
   * comp/BottomSheet.tsx does: the parent is app/(tabs)/_layout.tsx, which
   * holds the tab navigator, and useColorScheme() re-renders whatever calls
   * it. This form is a leaf; that layout is not.
   *
   * `c` is the palette itself, needed as well as `styles` because
   * placeholderTextColor is a PROP on TextInput, not a style, so it cannot
   * come out of a StyleSheet.
   */
  const scheme = schemeOf(useColorScheme());
  const styles = STYLES[scheme];
  const c = PALETTES[scheme];

  /*
   * A new expense that arrived with its title already written.
   *
   * Not state: the props are read at mount and the form is remounted on every
   * open, so this cannot change while the sheet is up. It decides which field
   * the cursor starts in, and whether the category is worked out at open.
   */
  const prefilled = !initial && (initialTitle ?? "").length > 0;

  /*
   * Lazy initialisers — useState(() => ...) rather than useState(...).
   *
   * The function runs on mount only. Passing the value directly would
   * recompute it on every render and throw the result away, which is wasted
   * work on every keystroke.
   */
  const [amount, setAmount] = useState<string>(() =>
    initial ? toInput(initial.amountMinor, initial.currencyCode) : "",
  );
  const [title, setTitle] = useState<string>(
    () => initial?.title ?? initialTitle ?? "",
  );

  /*
   * null means "not chosen yet". This is NOT the filter's null, which means
   * "every category". This one resolves to UNCATEGORISED_ID at save time, so
   * the database never receives a null category_id.
   *
   * A pre-filled title gets its suggestion HERE, at mount. handleTitleBlur
   * below is what normally runs the lookup, and a pre-filled form starts with
   * the cursor in the amount, so the title never takes focus and never blurs.
   * Without this line the category would stay empty until the person tapped
   * into the title and out again.
   *
   * It is a synchronous database read during the first render — 21ms and 28ms
   * on a title with 5,000 rows, against a keyboard that has taken anywhere
   * from 506ms to 4294ms to appear over this sheet.
   *
   * pickedByUser stays false below, so a tap on a category row still wins.
   */
  const [category, setCategory] = useState<Category | null>(() => {
    if (initial) return initial.category ?? null;
    if (initialTitle) return suggestCategory(initialTitle);
    return null;
  });

  /*
   * Whether a HUMAN chose the category, as opposed to the blur handler having
   * filled it in.
   *
   * `category !== null` cannot answer that — both a tap and a suggestion
   * leave a non-null value behind. Only this boolean separates them: a
   * suggestion may overwrite a suggestion, but nothing overwrites a tap.
   * Creating a category counts as a tap.
   *
   * Starts TRUE when editing a row that already has a real category, because
   * that category is a choice someone already made. Without this line, tabbing
   * out of the title field on an edit runs a suggestion and silently moves the
   * expense to whatever category that title usually sits in.
   *
   * A suggestion made at mount for a pre-filled title is still a suggestion,
   * so this stays false there.
   *
   * Uncategorised does NOT count as a choice. It means "not sorted yet", so
   * there is nothing there to protect and a suggestion is welcome.
   */
  const [pickedByUser, setPickedByUser] = useState<boolean>(
    () => initial?.category != null && initial.category.id !== UNCATEGORISED_ID,
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  /* The inline new-category field. Only ever creates; renaming lives on the
   * category management screen. */
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatDraft, setNewCatDraft] = useState("");
  /*
   * Where insertCategory's throws land. Two of them: a blank name and a
   * duplicate name. Both messages were written to be read by a person.
   * Without this state an uncaught throw inside onPress is a red screen in
   * development and a crash in production.
   */
  const [catError, setCatError] = useState<string | null>(null);

  /*
   * An edited row keeps its own currency. A new one gets the default.
   *
   * Held as a plain const, not state, because nothing in this form can change
   * it. It flows into sanitizeAmount, toMinor and onSubmit so all three agree
   * about how many decimal places the amount has.
   */
  const currencyCode = initial?.currencyCode ?? DEFAULT_CURRENCY;

  /*
   * Holds the amount field so the title's keyboard key can move focus into
   * it. A ref, not state, because nothing on screen changes when this is set
   * — re-rendering for it would be work with no picture to show for it.
   */
  const amountRef = useRef<TextInput>(null);

  /*
   * The moment this form mounted, which is the moment the sheet opened: a
   * hidden Modal renders null, so every open is a fresh mount.
   *
   * The sheet's own `keyboard show` line counts from the same moment, so the
   * gap between the two lines is what the keyboard costs and nothing else.
   * With only the keyboard line, a tap made by a person sits inside that
   * number and cannot be told apart from a slow keyboard.
   *
   * Lazy useState, like every initialiser above, so a re-render cannot move
   * the start time.
   */
  const [openedAt] = useState(() => Date.now());

  /*
   * The name passed in says which keyboard the field asks for, so one line
   * reports both which field took the cursor and which keyboard should have
   * followed it.
   */
  const logFocus = (which: string) => {
    if (__DEV__) {
      console.log(
        `field focused: ${which}, ${Date.now() - openedAt}ms after the sheet opened`,
      );
    }
  };

  /*
   * configureNext applies to the NEXT render only, so it has to be called
   * immediately before the setState that changes the shape.
   *
   * KNOWN ISSUE: this currently snaps rather than sliding, and the cause has
   * not been found. It is cosmetic.
   */
  const animate = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  /*
   * Read when the picker OPENS, not when the form mounts. A list read once at
   * launch would not show a category added since.
   *
   * This also covers a category created below: saveNewCategory leaves the
   * picker closed, so the next open runs this again and reads the new row.
   */
  useEffect(() => {
    if (!pickerOpen) return;
    setCategories(readCategories());
  }, [pickerOpen]);

  const amountMinor = toMinor(amount, currencyCode);
  const canSave = amountMinor !== null && title.trim().length > 0;

  /*
   * A read that runs before the write, to decide what the write is told.
   *
   * onBlur fires whenever this field loses focus, which includes tapping the
   * knob and tapping the submit button. So a save pays for this query too.
   *
   * On a pre-filled form the cursor starts in the amount, so this does not
   * run at all unless the person taps into the title themselves — which is
   * exactly when the title might change and the suggestion should be redone.
   */
  const handleTitleBlur = () => {
    /* A tap outranks everything. Not `category !== null`, which is also true
     * after a suggestion and would lock the form after the first one. */
    if (pickedByUser) return;

    const found = suggestCategory(title);

    /*
     * Clearing on a miss is deliberate. The old value was this handler's
     * claim about the OLD title. The title changed, so the claim is void.
     *
     * TO KEEP THE OLD SUGGESTION INSTEAD, replace the line below with:
     *   if (found) setCategory(found);
     */
    setCategory(found);
  };

  const openAddCategory = () => {
    animate();
    /* Close the picker. The field replaces the row the picker hangs off, so
     * leaving it open would put a list under a field with no chevron. */
    setPickerOpen(false);
    setCatError(null);
    setNewCatDraft("");
    setAddingCategory(true);
  };

  const cancelAddCategory = () => {
    animate();
    setAddingCategory(false);
    setNewCatDraft("");
    setCatError(null);
  };

  /*
   * Creates the typed category and selects it. Two callers: the ✓ (and the
   * keyboard's done key in the field), and handleSave below.
   *
   * Returns the new row, or null when insertCategory threw. On null the
   * message is already under the field, the field keeps what was typed so it
   * can be corrected, and nothing was written.
   */
  const saveNewCategory = (): Category | null => {
    try {
      /* Returns the row it created, so nothing needs re-reading to select
       * it. */
      const made = insertCategory(newCatDraft);

      setCategory(made);
      /* Typing a name and tapping the tick is a choice. Without this line the
       * next title blur silently replaces the category you just made. */
      setPickedByUser(true);

      cancelAddCategory();
      return made;
    } catch (err) {
      /* Deliberately does NOT call cancelAddCategory(). The field keeps what
       * was typed so it can be corrected. */
      setCatError(err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  const handleSave = () => {
    /*
     * The same rule as the button's `disabled`. The amount field's "done" key
     * calls this directly and ignores the disabled button, so this guard is
     * the real protection, not decoration.
     *
     * It checks the title too, through canSave. Below, a category can be
     * written BEFORE the expense, and it must never be written for an expense
     * that is not going to save. `amountMinor === null` stays as its own
     * check because TypeScript cannot see that canSave already ruled it out.
     */
    if (amountMinor === null || !canSave) return;

    /* The fallback lives here rather than in state, so "not chosen" stays
     * visibly different from "chose Uncategorised" right up to the call. */
    let categoryId = category?.id ?? UNCATEGORISED_ID;

    /*
     * A name typed into the new-category field, with the ✓ not tapped.
     *
     * The person meant "file this in the category I just typed". Without this
     * block, the save used whatever category was already showing, and the
     * typed name went away with the sheet, without a word.
     *
     * So the category is made first, exactly as the ✓ makes it, and the
     * expense goes into it. If making it throws — a name that already
     * exists — the message shows under the field and NOTHING is saved, so
     * the name can be fixed and the button tapped again.
     *
     * Two writes, not one transaction. If the expense write ever failed after
     * this, what is left is an empty category: a valid state, visible on the
     * Categories tab. And because saveNewCategory closes the field and selects
     * the new row, a second tap files into it instead of making it twice.
     *
     * An open field with nothing typed in it is ignored, the same as ✕.
     */
    if (addingCategory && newCatDraft.trim().length > 0) {
      const made = saveNewCategory();
      if (made === null) return;
      categoryId = made.id;
    }

    onSubmit(title.trim(), amountMinor, currencyCode, categoryId);
  };

  return (
    <View style={styles.form}>
      {/* Title first. The blur that runs the lookup lands in the gap between
          leaving this field and reaching the amount — a moment when nothing
          is animating and nothing is being typed. The query still blocks the
          thread. This chooses WHEN it blocks.

          autoFocus puts the cursor here on open, EXCEPT when the title
          arrived pre-filled: then the amount is the only thing left to type,
          so it takes the cursor instead and this field is left alone. */}
      <TextInput
        style={styles.titleInput}
        value={title}
        onChangeText={setTitle}
        onBlur={handleTitleBlur}
        // Typing and the list do not share the screen: a field taking focus
        // closes the list, because the keyboard it brings would cover it.
        onFocus={() => {
          logFocus("title (default keyboard)");
          setPickerOpen(false);
        }}
        placeholder="What for?"
        placeholderTextColor={c.placeholder}
        // "next", not "done". This key does not save — it moves to the
        // amount, which is the only field that can make canSave true.
        returnKeyType="next"
        onSubmitEditing={() => amountRef.current?.focus()}
        maxLength={60}
        autoFocus={!prefilled}
      />

      <View style={styles.amountRow}>
        <Text style={styles.currency}>৳</Text>
        <TextInput
          ref={amountRef}
          // Same rule as the title field: focus closes the list.
          onFocus={() => {
            logFocus("amount (decimal-pad)");
            setPickerOpen(false);
          }}
          style={styles.amountInput}
          value={amount}
          onChangeText={(t) => setAmount(sanitizeAmount(t, currencyCode))}
          placeholder="0.00"
          placeholderTextColor={c.placeholder}
          keyboardType="decimal-pad"
          maxLength={12}
          returnKeyType="done"
          onSubmitEditing={handleSave}
          // Only when the title came pre-filled. Exactly one field in this
          // form may claim the cursor, and the title has it otherwise.
          autoFocus={prefilled}
        />
      </View>

      {/* YOURS TO RESTYLE. Three things are mechanism, not looks:

          ONE container View in both states. Only its flexDirection and its
          children change. Wrap this whole View in a ternary instead and it
          becomes two different elements — a remove and an add, which
          LayoutAnimation cannot slide.

          The knob is the LAST child in BOTH states. row-reverse paints the
          last child leftmost, row paints it rightmost. That is what moves
          it without moving it in the JSX.

          The chevron is plain Text inside the label's Pressable, not its
          own. A Pressable inside a Pressable has no reliable winner. */}
      <View
        style={[
          styles.categoryRow,
          addingCategory ? styles.categoryRowOpen : styles.categoryRowClosed,
        ]}
      >
        {addingCategory ? (
          <TextInput
            style={styles.newCatInput}
            value={newCatDraft}
            onChangeText={setNewCatDraft}
            placeholder="New category"
            placeholderTextColor={c.placeholder}
            autoFocus
            onSubmitEditing={saveNewCategory}
            returnKeyType="done"
            maxLength={40}
          />
        ) : (
          // flex: 1 is not cosmetic. Without it this Pressable is only as
          // wide as the word, and the rest of the row is dead to taps.
          <Pressable
            style={styles.categoryLabel}
            onPress={() => {
              /*
               * Opening the list sends the keyboard away. A Pressable never
               * takes focus, so without this the title keeps it, the keyboard
               * stays up, and the list and the button sit behind it.
               *
               * Blurring the title also runs handleTitleBlur, so the suggestion
               * arrives as the list opens. A tap on a row still wins over it.
               */
              if (!pickerOpen) Keyboard.dismiss();
              setPickerOpen((open) => !open);
            }}
          >
            <Text style={category ? styles.categoryName : styles.categoryEmpty}>
              {category ? category.name : "Category"}
            </Text>
            <Text style={styles.chevron}>{pickerOpen ? "▲" : "▼"}</Text>
          </Pressable>
        )}

        {addingCategory ? (
          <Pressable
            onPress={cancelAddCategory}
            hitSlop={8}
            style={styles.clear}
          >
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={styles.knob}
          onPress={addingCategory ? saveNewCategory : openAddCategory}
        >
          <Text style={styles.knobText}>{addingCategory ? "✓" : "+"}</Text>
        </Pressable>
      </View>

      {catError ? <Text style={styles.error}>{catError}</Text> : null}

      {pickerOpen ? (
        <View style={styles.pickerBox}>
                   <CategoryList
            // Required there, and this component already read it above. See
            // the comment on that prop for why it is a prop and not a hook.
            scheme={scheme}
            // No null item, so no "All categories" row. That is the entire
            // difference between this list and the filter's.
            //
            // A line BETWEEN rows, so the last one does not get one: the
            // box's own edge is already there, and a line on top of it reads
            // as a second edge.
            items={categories.map((c, i) => ({
              id: c.id,
              name: c.name,
              dividerAfter: i < categories.length - 1,
            }))}
            selectedId={category?.id ?? null}
            onSelect={(item) => {
              // item.id is nullable in the shared type because the filter
              // needs it to be. This list never contains a null item, so a
              // null arriving here is a bug — refuse it rather than coerce.
              if (item.id === null) return;
              setCategory({ id: item.id, name: item.name });
              // Reaching this line means a finger landed on a row.
              setPickedByUser(true);
              setPickerOpen(false);
            }}
          />
        </View>
      ) : null}

      <Pressable
        style={[styles.button, !canSave && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={!canSave}
      >
        <Text style={styles.buttonText}>{submitLabel}</Text>
      </Pressable>
    </View>
  );
}

/*
 * Built twice at module load, once per palette — the shape every themed file
 * in this project uses. Nothing here is computed at runtime, because there
 * are exactly two palettes and both are written in the source.
 */
function makeStyles(c: Palette) {
  return StyleSheet.create({
    // No backgroundColor and no border. The sheet paints its own surface behind
    // this, and a second panel inside the panel would show as a seam.
    form: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },

    titleInput: {
      color: c.text,
      fontSize: 16,
      // card on the sheet's page — the same pair every list screen uses, and
      // the same pair comp/BottomSheet.tsx is drawn for: 1.23 dark, 1.12 light.
      backgroundColor: c.card,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },

    amountRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      borderRadius: 10,
      paddingHorizontal: 14,
    },
    currency: { color: c.textDim, fontSize: 24, fontWeight: "600" },
    amountInput: {
      flex: 1,
      // Every TextInput needs an explicit colour. The platform default is
      // near-black and inherits nothing from the parent View — which was merely
      // invisible on a dark field and is merely correct-looking on a light one,
      // so neither mode would have caught a missing colour here.
      color: c.textStrong,
      fontSize: 28,
      fontWeight: "700",
      paddingVertical: 14,
      textAlign: "right",
      // Digits keep a fixed width, so the number does not jitter sideways
      // as you type. Same reason the row amounts use it.
      fontVariant: ["tabular-nums"],
    },

    // Shared by both states. The knob is 36 tall and padding is 8, so the
    // row is 52. For semicircular ends, borderRadius has to be half of that
    // — 26. It is 10 here to match the two fields above instead.
    categoryRow: {
      alignItems: "center",
      alignSelf: "stretch",
      minHeight: 52,
      borderRadius: 10,
      padding: 8,
      backgroundColor: c.card,
    },
    // The ONLY difference between the two states is which way the row runs.
    categoryRowClosed: { flexDirection: "row-reverse" },
    categoryRowOpen: { flexDirection: "row" },

    categoryLabel: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
    },
    categoryName: { color: c.text, fontSize: 16 },
    // Same token as the two placeholders above, so an unchosen category still
    // reads as empty rather than as a value. It has to move with them.
    categoryEmpty: { color: c.placeholder, fontSize: 16 },
    chevron: { color: c.textDim, fontSize: 12 },

    newCatInput: {
      flex: 1,
      color: c.text,
      fontSize: 16,
      paddingHorizontal: 14,
      // Android gives TextInput vertical padding of its own, which would
      // push this row past 52 and break the knob's centring.
      paddingVertical: 0,
    },
    clear: { paddingHorizontal: 12 },
    clearText: { color: c.textDim, fontSize: 16 },

    // YOURS TO RESTYLE — it IS the tab bar's + pair now, which is what this
    // comment always said it matched. So it inverts: white circle with a black
    // glyph in dark, black circle with a white glyph in light. Red is gone from
    // every control in this form; it is left only on the error line below,
    // where it means something.
    knob: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.barAddBg,
      alignItems: "center",
      justifyContent: "center",
    },
    knobText: {
      color: c.barAddIcon,
      fontSize: 20,
      fontWeight: "600",
      // Android pads text vertically with invisible space, which pushes the
      // glyph below the centre of a circle. Android-only, no effect on iOS.
      includeFontPadding: false,
      marginTop: -1,
    },
    // dangerInk, not danger: this is TEXT on a surface, not a fill. 5.37 on the
    // dark sheet, 4.97 on the light one.
    error: { color: c.dangerInk, fontSize: 13, paddingHorizontal: 4 },

    // CategoryList brings its own horizontal padding of 20. This box only
    // supplies the surface behind it.
    //
    // maxHeight is what makes the list scroll. CategoryList's ScrollView can
    // get shorter than its own rows, but only when something above it is
    // limited — and this View is the only thing between it and the form.
    // Without the limit the box grows to the height of every category and
    // pushes the button down.
    pickerBox: {
      backgroundColor: c.card,
      borderRadius: 10,
      overflow: "hidden",
      maxHeight: 220,
    },
    // YOURS TO RESTYLE — follows the tab bar's +, which is the control it was
    // drawn to match at Session 30 and which started inverting at Session 34.
    // So: white with black text in dark (unchanged), black with white text in
    // light. The label reads 21.00 on it either way.
    button: {
      backgroundColor: c.barAddBg,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 4,
    },
    /*
     * Named rather than inline, so the disabled look is one thing you can
     * change in one place.
     *
     * 0.35 is UNCHANGED, and it is worth knowing it does not mean the same
     * thing in both modes. An opacity blends the button AND its label toward
     * whatever is behind — the sheet — and the two palettes sit at different
     * distances from their button. Dark reads 3.00 against the sheet; light
     * reads 2.42 [both computed].
     *
     * Left at one value on purpose: a disabled control is meant to recede, and
     * inverting the button already took light from 1.04 (a button-shaped
     * nothing) to 2.42. If it ever needs to be stronger, 0.45 is the smallest
     * single value clearing 3.00 in both — at the cost of a brighter disabled
     * button in dark — and a per-mode pair in the palette is the alternative,
     * exactly as dimOpacity already does.
     */
    buttonDisabled: { opacity: 0.35 },
    buttonText: { color: c.barAddIcon, fontSize: 16, fontWeight: "600" },
  });
}

const STYLES: Record<Scheme, ReturnType<typeof makeStyles>> = {
  dark: makeStyles(PALETTES.dark),
  light: makeStyles(PALETTES.light),
};