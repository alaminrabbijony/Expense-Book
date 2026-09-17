
import { readCategories, UNCATEGORISED_ID, type Category } from "@/db/expenses";
import { DEFAULT_CURRENCY, type Minor, sanitizeAmount, toMinor } from "@et/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import CategoryList from "./CategoryLListItem";

type Props = {
  onAdd: (
    title: string,
    amountMinor: Minor,
    currency: string,
    categoryId: string,
  ) => void;
};

export default function ExpenseForm({ onAdd }: Props) {
  const [amount, setAmount] = useState<string>("");
  const [title, setTitle] = useState<string>("");

  // null here means "not chosen yet". This is NOT the filter's null, which
  // means "every category". This one resolves to UNCATEGORISED_ID at save
  // time, so the database never receives a null category_id.
  const [category, setCategory] = useState<Category | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // Read when the picker OPENS, not when the form mounts. Same shape as the
  // effect in CategorySheet keyed on `visible`, and for the same reason: a
  // list read once at launch will not show a category added at 5i.
  useEffect(() => {
    if (!pickerOpen) return;
    setCategories(readCategories());
  }, [pickerOpen]);

  const amountMinor = toMinor(amount, DEFAULT_CURRENCY);
  const canSave = amountMinor !== null && title.trim().length > 0;

  const handleSave = () => {
    // The keyboard's "done" key calls this directly and ignores the
    // disabled button, so the guard is real protection, not decoration.
    if (amountMinor === null) return;

    // The fallback lives here rather than in state, so "not chosen" stays
    // visibly different from "chose Uncategorised" right up to the call.
    onAdd(
      title.trim(),
      amountMinor,
      DEFAULT_CURRENCY,
      category?.id ?? UNCATEGORISED_ID,
    );
  };

  return (
    <View style={styles.form}>
      <View style={styles.amountRow}>
        <Text style={styles.currency}>৳</Text>
        <TextInput
          style={styles.amountInput}
          value={amount}
          onChangeText={(t) => setAmount(sanitizeAmount(t, DEFAULT_CURRENCY))}
          placeholder="0.00"
          placeholderTextColor="#4A4F58"
          keyboardType="decimal-pad"
          maxLength={12}
          autoFocus
        />
      </View>

      <TextInput
        style={styles.titleInput}
        value={title}
        onChangeText={setTitle}
        placeholder="What for?"
        placeholderTextColor="#4A4F58"
        returnKeyType="done"
        onSubmitEditing={handleSave}
        maxLength={60}
      />

      {/* YOURS TO REDESIGN. This is the smallest control that works. */}
      <Pressable
        style={styles.categoryRow}
        onPress={() => setPickerOpen((open) => !open)}
      >
        <Text style={category ? styles.categoryName : styles.categoryEmpty}>
          {category ? category.name : "Category"}
        </Text>
        <Text style={styles.chevron}>{pickerOpen ? "▲" : "▼"}</Text>
      </Pressable>

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
        <Text style={styles.buttonText}>Add expense</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // No backgroundColor and no border. BottomSheet paints #171B22 behind
  // this, and a second panel inside the panel would show as a seam.
  form: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },

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

  titleInput: {
    color: "#ECEDEE",
    fontSize: 16,
    backgroundColor: "#0F1115",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0F1115",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  categoryName: { color: "#ECEDEE", fontSize: 16 },
  // Same colour as the two placeholders above, so an unchosen category
  // reads as empty rather than as a value.
  categoryEmpty: { color: "#4A4F58", fontSize: 16 },
  chevron: { color: "#8A8F98", fontSize: 12 },

  // CategoryList brings its own horizontal padding of 20. This box only
  // supplies the surface behind it.
  pickerBox: { backgroundColor: "#0F1115", borderRadius: 10, overflow: "hidden" },

  button: {
    backgroundColor: "#E5484D",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  // Named rather than inline, so the disabled look is one thing you can
  // change in one place when there is a second form at 5i.
  buttonDisabled: { opacity: 0.35 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});