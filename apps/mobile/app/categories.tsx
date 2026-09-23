
import CategoryManageList from "@/comp/CategoryManageList";
import {
  deleteCategory,
  insertCategory,
  readCategories,
  readTotals,
  renameCategory,
  UNCATEGORISED_ID,
  type Category,
} from "@/db/expenses";
import { DEFAULT_CURRENCY, formatMoney, type Minor } from "@et/shared";
import { router, Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";



// What the confirm modal needs to know. Read at the moment Delete is
// tapped, not held for every row — readTotals(id) is a two-aggregate query
// against an index that leads with category_id, so it is cheap on demand
// and pointless to precompute seven times.
type Pending = {
  id: string;
  name: string;
  count: number;
  totalMinor: Minor;
};

export default function Categories() {
  // Read once at mount. Nothing else on the device writes to categories, so
  // this screen is the only thing that can make its own list wrong — and it
  // patches the list itself after every write.
  const [items, setItems] = useState<Category[]>(() => readCategories());

  // The field's three pieces of state.
  //
  // open   — is the field revealed at all
  // draft  — what is typed in it
  // editId — null means the button says Add and Save calls insertCategory.
  //          An id means it says Save and calls renameCategory(id, draft).
  //
  // That null-means-create rule is the same shape as the data layer:
  // assertNameFree(name) versus assertNameFree(name, excludeId).
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  // Where insertCategory's and renameCategory's throw messages land. They
  // were written to be read by a person: "Category name cannot be empty."
  // and 'A category called "Food" already exists.'
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

   // Every layout change on this screen goes through here. configureNext
  // applies to the NEXT render only, so it has to be called immediately
  // before the setState that changes the shape — not in an effect after it.
  //
  // Observed at Session 15, Pixel 8 emulator (API 36): the reveal snaps, it
  // does not slide. The cause was never diagnosed — it could be the New
  // Architecture, or it could be this call site. The snap was accepted, so
  // this stays rather than being replaced with Animated.
  const animate = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const openAdd = () => {
    animate();
    setEditId(null);
    setDraft("");
    setError(null);
    setOpen(true);
  };

  const openEdit = (item: Category) => {
    animate();
    setEditId(item.id);
    setDraft(item.name);
    setError(null);
    setOpen(true);
  };

  // Not a nicety. Without a way out, tapping Edit puts the screen in a mode
  // it cannot leave — the row stays struck through and the field stays
  // loaded. Restyle it however you like, but something has to do this.
  const cancel = () => {
    animate();
    setOpen(false);
    setEditId(null);
    setDraft("");
    setError(null);
  };

  const save = () => {
    try {
      if (editId === null) {
        insertCategory(draft);
        // Re-read after an insert. A new row appearing does not move any
        // row that is already under your finger, so re-sorting is safe here
        // in a way it is not after a rename.
        setItems(readCategories());
      } else {
        const id = editId;
        renameCategory(id, draft);

        // Patch the one row instead of re-reading.
        //
        // readCategories sorts by name, so a re-read would move the row you
        // just edited to a new position — Food becoming Zomato jumps to the
        // bottom of the list under your finger. The next time this screen
        // mounts it reads fresh and sorted.
        //
        // .trim() mirrors what cleanCategoryName already did to the value
        // that reached the database. Skip it and the screen shows "Food "
        // while the row says "Food".
        const clean = draft.trim();
        setItems((prev) =>
          prev.map((c) => (c.id === id ? { ...c, name: clean } : c)),
        );
      }
      cancel();
    } catch (err) {
      // Deliberately does NOT call cancel(). The field keeps what was typed
      // so it can be corrected, and the row stays struck through.
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const askDelete = (item: Category) => {
    try {
      const { count, totalMinor } = readTotals(item.id);
      setPending({ id: item.id, name: item.name, count, totalMinor });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const confirmDelete = () => {
    if (!pending) return;
    const id = pending.id;

    setBusy(true);

    // The yield is the whole reason this is not four straight lines.
    //
    // all/run/tx are synchronous, so deleteCategory blocks the JavaScript
    // thread. Measured on a Pixel 8 emulator: 561ms for 20,001 rows, and
    // that was a rolled-back transaction, so a real commit is at least that.
    //
    // setBusy(true) only SCHEDULES a render. React cannot run it until this
    // handler returns. Call deleteCategory directly and the spinner never
    // paints — the app freezes, then redraws once, already finished.
    //
    // setTimeout(fn, 0) does not mean "now". It means "after the current
    // work finishes", which is exactly the gap React needs to paint.
    setTimeout(() => {
      try {
        deleteCategory(id);
        setItems(readCategories());
        // The deleted row may be the one loaded into the field.
        if (editId === id) {
          setOpen(false);
          setEditId(null);
          setDraft("");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
        setPending(null);
      }
    }, 0);
  };

  return (
    <SafeAreaView style={styles.screen}>
           {/* Sets options for THIS route only. No _layout.tsx edit needed. */}
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Categories</Text>
        {/* Balances the back chevron so the title sits centred. */}
        <View style={styles.backSpacer} />
      </View>

           <View style={styles.fieldArea}>
        <View style={[styles.pill, open ? styles.pillOpen : styles.pillClosed]}>
          {open ? (
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={editId === null ? "New category" : "Rename to"}
              placeholderTextColor="#5A606B"
              autoFocus
              // Enter on the keyboard does the same thing as the knob.
              onSubmitEditing={save}
              returnKeyType="done"
            />
          ) : (
            // The label is pressable too, so the whole pill opens, not just
            // the 44px circle.
            <Pressable style={styles.label} onPress={openAdd}>
              <Text style={styles.labelText}>Add</Text>
            </Pressable>
          )}

          {open ? (
            <Pressable onPress={cancel} hitSlop={8} style={styles.clear}>
              <Text style={styles.clearText}>✕</Text>
            </Pressable>
          ) : null}

          {/* The knob is the LAST child in BOTH states, and that is the whole
              trick. Closed, the pill is row-reverse, so the last child paints
              leftmost. Open, it is row, so the same child sits at the right.
              One element in two positions is something LayoutAnimation can
              slide. Swapping the order in JSX instead would be a remove and
              an add, which it cannot. */}
          <Pressable style={styles.knob} onPress={open ? save : openAdd}>
            <Text style={styles.knobText}>{open ? "✓" : "+"}</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {/* A route can scroll at screen level, so this does not need the
          bounded-height workaround the sheet's list does. */}
                {/* Edge to edge, no horizontal inset. The row borders inside
          CategoryManageList run full width too, so an inset one here would
          read as a different kind of line. */}
      <View style={styles.topDivider} />
            <ScrollView
        contentContainerStyle={styles.list}
        // The pill's TextInput has autoFocus, so opening Add puts the
        // keyboard up with these rows still on screen. Under the default,
        // "never", the first tap on Edit or Delete would only close the
        // keyboard, and the row would never receive it.
        keyboardShouldPersistTaps="handled"
      >
        <CategoryManageList
          items={items}
          editingId={editId}
          undeletableId={UNCATEGORISED_ID}
          onEdit={openEdit}
          onDelete={askDelete}
        />
      </ScrollView>

      <Modal
        visible={pending !== null}
        transparent
        animationType="fade"
        // Android back. Ignored while busy, because dismissing mid-delete
        // would leave the spinner orphaned with the write still running.
        onRequestClose={() => {
          if (!busy) setPending(null);
        }}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Delete {pending?.name}?</Text>

            <Text style={styles.dialogBody}>
              {pending && pending.count > 0
                ? `${pending.count} expenses worth ${formatMoney(
                    pending.totalMinor,
                    DEFAULT_CURRENCY,
                  )} will move to Uncategorised. The expenses are kept.`
                : "This category has no expenses in it."}
            </Text>

            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color="#8A8F98" />
                <Text style={styles.busyText}>Moving expenses…</Text>
              </View>
            ) : (
              <View style={styles.dialogActions}>
                <Pressable
                  style={styles.dialogBtn}
                  onPress={() => setPending(null)}
                >
                  <Text style={styles.dialogBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.dialogBtn, styles.dialogBtnDanger]}
                  onPress={confirmDelete}
                >
                  <Text style={styles.dialogBtnDangerText}>Delete</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F1115" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  back: { color: "#ECEDEE", fontSize: 30, fontWeight: "300", marginTop: -6 },
  backSpacer: { width: 18 },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },

   fieldArea: { paddingHorizontal: 20, paddingBottom: 16 },

  // Shared by both states. borderRadius is half of minHeight, which is what
  // makes the ends semicircular rather than just rounded.
    pill: {
    alignItems: "center",
    // Full width in BOTH states now, so it lives here rather than in the
    // two variants below.
    alignSelf: "stretch",
    minHeight: 80,
    borderRadius: 40,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2A2F38",
  },
  // The ONLY difference between the two states is which way the row runs.
  // row-reverse paints the last child first, which is what puts the knob on
  // the left without moving it in the JSX.
  pillClosed: {
    flexDirection: "row-reverse",
    backgroundColor: "#22262E",
  },
  pillOpen: {
    flexDirection: "row",
    backgroundColor: "#171B22",
  },

     // flex: 1 is not cosmetic. Without it the Pressable is only as wide as
  // the word "Add", and the rest of a full-width bar is dead to taps.
  label: { flex: 1, paddingHorizontal: 22 },
   labelText: { color: "#ECEDEE", fontSize: 19, fontWeight: "600" },

    input: {
    flex: 1,
    color: "#ECEDEE",
    fontSize: 18,
    paddingHorizontal: 18,
    // Android gives TextInput vertical padding of its own, which would make
    // the pill taller than 80 and stop the ends being semicircles.
    paddingVertical: 0,
  },
 clear: { paddingHorizontal: 12 },
  clearText: { color: "#8A8F98", fontSize: 18 },

  knob: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E5484D",
    alignItems: "center",
    justifyContent: "center",
  },
  knobText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "600",
    includeFontPadding: false,
    marginTop: -2,
  },
  error: { color: "#E5484D", fontSize: 13, paddingTop: 8, paddingHorizontal: 12 },

  list: { paddingBottom: 40 },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  dialog: {
    width: "100%",
    backgroundColor: "#171B22",
    borderRadius: 14,
    padding: 20,
  },
  dialogTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    paddingBottom: 8,
  },
  dialogBody: { color: "#8A8F98", fontSize: 14, lineHeight: 20 },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    paddingTop: 20,
  },
  dialogBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  dialogBtnText: { color: "#8A8F98", fontSize: 15, fontWeight: "600" },
  dialogBtnDanger: { backgroundColor: "#E5484D" },
  dialogBtnDangerText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },

  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 20,
  },
  busyText: { color: "#8A8F98", fontSize: 14 },
    topDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#22262E",
  },
});