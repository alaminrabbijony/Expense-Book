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
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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
  submitLabel,
  onSubmit,
}: Props) {
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
  const [title, setTitle] = useState<string>(() => initial?.title ?? "");

  /*
   * null means "not chosen yet". This is NOT the filter's null, which means
   * "every category". This one resolves to UNCATEGORISED_ID at save time, so
   * the database never receives a null category_id.
   */
  const [category, setCategory] = useState<Category | null>(
    () => initial?.category ?? null,
  );

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
   * Uncategorised does NOT count as a choice. It means "not sorted yet", so
   * there is nothing there to protect and a suggestion is welcome.
   */
  const [pickedByUser, setPickedByUser] = useState<boolean>(
    () =>
      initial?.category != null && initial.category.id !== UNCATEGORISED_ID,
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

  const saveNewCategory = () => {
    try {
      /* Returns the row it created, so nothing needs re-reading to select
       * it. */
      const made = insertCategory(newCatDraft);

      setCategory(made);
      /* Typing a name and tapping the tick is a choice. Without this line the
       * next title blur silently replaces the category you just made. */
      setPickedByUser(true);

      cancelAddCategory();
    } catch (err) {
      /* Deliberately does NOT call cancelAddCategory(). The field keeps what
       * was typed so it can be corrected. */
      setCatError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSave = () => {
    /* The amount field's "done" key calls this directly and ignores the
     * disabled button, so the guard is real protection, not decoration. */
    if (amountMinor === null) return;

    /* The fallback lives here rather than in state, so "not chosen" stays
     * visibly different from "chose Uncategorised" right up to the call. */
    onSubmit(
      title.trim(),
      amountMinor,
      currencyCode,
      category?.id ?? UNCATEGORISED_ID,
    );
  };

  return (
    <View style={styles.form}>
      {/* Title first. The blur that runs the lookup lands in the gap between
          leaving this field and reaching the amount — a moment when nothing
          is animating and nothing is being typed. The query still blocks the
          thread. This chooses WHEN it blocks.

          autoFocus puts the cursor here on open, in BOTH modes. If editing
          should start on the amount instead, that is the line to change. */}
      <TextInput
        style={styles.titleInput}
        value={title}
        onChangeText={setTitle}
        onBlur={handleTitleBlur}
        placeholder="What for?"
        placeholderTextColor="#4A4F58"
        // "next", not "done". This key does not save — it moves to the
        // amount, which is the only field that can make canSave true.
        returnKeyType="next"
        onSubmitEditing={() => amountRef.current?.focus()}
        maxLength={60}
        autoFocus
      />

      <View style={styles.amountRow}>
        <Text style={styles.currency}>৳</Text>
        <TextInput
          ref={amountRef}
          style={styles.amountInput}
          value={amount}
          onChangeText={(t) => setAmount(sanitizeAmount(t, currencyCode))}
          placeholder="0.00"
          placeholderTextColor="#4A4F58"
          keyboardType="decimal-pad"
          maxLength={12}
          returnKeyType="done"
          onSubmitEditing={handleSave}
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
            placeholderTextColor="#5A606B"
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
            onPress={() => setPickerOpen((open) => !open)}
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
            // No null item, so no "All categories" row. That is the entire
            // difference between this list and the filter's.
            items={categories.map((c) => ({ id: c.id, name: c.name }))}
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

const styles = StyleSheet.create({
  // No backgroundColor and no border. The sheet paints #171B22 behind this,
  // and a second panel inside the panel would show as a seam.
  form: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },

  titleInput: {
    color: "#ECEDEE",
    fontSize: 16,
    backgroundColor: "#0F1115",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F1115",
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  currency: { color: "#8A8F98", fontSize: 24, fontWeight: "600" },
  amountInput: {
    flex: 1,
    // Every TextInput needs an explicit colour on a dark surface. The
    // default is near-black and inherits nothing from the parent View.
    color: "#FFFFFF",
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
    backgroundColor: "#0F1115",
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
  categoryName: { color: "#ECEDEE", fontSize: 16 },
  // Same colour as the two placeholders above, so an unchosen category
  // reads as empty rather than as a value.
  categoryEmpty: { color: "#4A4F58", fontSize: 16 },
  chevron: { color: "#8A8F98", fontSize: 12 },

  newCatInput: {
    flex: 1,
    color: "#ECEDEE",
    fontSize: 16,
    paddingHorizontal: 14,
    // Android gives TextInput vertical padding of its own, which would
    // push this row past 52 and break the knob's centring.
    paddingVertical: 0,
  },
  clear: { paddingHorizontal: 12 },
  clearText: { color: "#8A8F98", fontSize: 16 },

  knob: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E5484D",
    alignItems: "center",
    justifyContent: "center",
  },
  knobText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
    // Android pads text vertically with invisible space, which pushes the
    // glyph below the centre of a circle. Android-only, no effect on iOS.
    includeFontPadding: false,
    marginTop: -1,
  },
  error: { color: "#E5484D", fontSize: 13, paddingHorizontal: 4 },

  // CategoryList brings its own horizontal padding of 20. This box only
  // supplies the surface behind it.
  //
  // maxHeight is what makes the list scroll. CategoryList's ScrollView can
  // get shorter than its own rows, but only when something above it is
  // limited — and this View is the only thing between it and the form.
  // Without the limit the box grows to the height of every category and
  // pushes the button down.
  pickerBox: {
    backgroundColor: "#0F1115",
    borderRadius: 10,
    overflow: "hidden",
    maxHeight: 220,
  },
  button: {
    backgroundColor: "#E5484D",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  // Named rather than inline, so the disabled look is one thing you can
  // change in one place.
  buttonDisabled: { opacity: 0.35 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});