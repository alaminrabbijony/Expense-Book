import { PLACEHOLDER_SHADE, shadeForCategory } from "@/comp/categoryIcon";
import CategoryManageList from "@/comp/CategoryManageList";
import IconPicker from "@/comp/IconPicker";
import { categoryVersion, onCategoriesChanged } from "@/db/changes";
import {
  deleteCategory,
  insertCategory,
  readCategories,
  readCategoryIcons,
  readTotals,
  renameCategory,
  setCategoryIcon,
  UNCATEGORISED_ID,
  type Category,
  type CategoryIcons,
} from "@/db/expenses";
import { DEFAULT_CURRENCY, formatMoney, type Minor } from "@et/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
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

/*
 * Which edges the SafeAreaView pads. Not the bottom: the tab bar below this
 * screen already pads for the system navigation bar, and SafeAreaView pads
 * by the whole window's insets, not its own position. The full reason is
 * at SAFE_EDGES in comp/ExpenseListScreen.tsx.
 */
const SAFE_EDGES = ["top", "left", "right"] as const;

/*
 * How far above the editing row to stop scrolling, so it does not sit
 * jammed against the pill. YOURS TO RESTYLE.
 */
const SCROLL_GAP = 12;

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
  /*
   * The category version this list was read at.
   *
   * db/changes.ts adds 1 to the category version after every category write,
   * anywhere in the app. When this number is behind that one, `items` is
   * older than the database.
   *
   * Set in two kinds of place, the same as in comp/ExpenseListScreen.tsx:
   *
   *   a fresh read     the initialiser below, and readFresh in the focus
   *                    effect.
   *   this screen's    save (add, rename and icon) and confirmDelete. Each
   *   own write        one updates `items` itself straight after its write,
   *                    so the new version is already shown. Marked seen
   *                    inside the handler, so the listener — told in a
   *                    microtask, after the handler returns — finds nothing
   *                    to do.
   *
   * A ref, not state: nothing draws it, and the focus effect is created once,
   * so it must read the current value rather than the first render's.
   */
  const seenRef = useRef(0);

  /*
   * The list, read at mount and kept fresh in three ways:
   *
   *   this screen's own writes   patch or re-read it themselves (save,
   *                              confirmDelete)
   *   a write while this tab     the listener below re-reads. The add
   *   is on screen               sheet's inline "new category" can write
   *                              while this list sits under the sheet.
   *   a write while this tab     the focus check below re-reads once, when
   *   is hidden                  this tab comes back
   */
  const [items, setItems] = useState<Category[]>(() => {
    const first = readCategories();
    /* Read in the same synchronous step as the list, so no write can land
     * between the two. */
    seenRef.current = categoryVersion();
    return first;
  });

  /*
   * Which categories have an icon. A separate read, because readCategories
   * does not carry the icon — that is why readCategoryDetail exists with a
   * type of its own.
   *
   * Both initialisers run during the same render, with nothing awaited
   * between them, so the icons cannot be from a different moment than the
   * names.
   *
   * It needs no version of its own: icons live on the categories table, so
   * the counter that already tells this screen about a rename tells it about
   * an icon too.
   */
  const [icons, setIcons] = useState<CategoryIcons>(() => readCategoryIcons());

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

  /*
   * The icon picked for the row being edited, but not yet written. null is a
   * real choice here — it is how an icon is taken away again — so "untouched"
   * is NOT spelled with null. It is seeded from the row in openEdit, which is
   * what makes it always mean something while editing.
   */
  const [iconDraft, setIconDraft] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Where insertCategory's, renameCategory's and setCategoryIcon's throw
  // messages land. They were written to be read by a person: "Category name
  // cannot be empty." and 'A category called "Food" already exists.'
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  /* The scrolling list, and where each row sits inside it. The positions are
   * a ref: nothing on screen draws them, and a row reporting its layout must
   * not cause a render. */
  const scrollRef = useRef<ScrollView>(null);
  const rowTopsRef = useRef<Record<string, number>>({});

  const onRowLayout = useCallback((id: string, y: number) => {
    rowTopsRef.current[id] = y;
  }, []);

  /*
   * How tall the keyboard is right now, 0 when it is down.
   *
   * Keyboard.addListener is React Native's own, and it is where the
   * "keyboard show: height 312" line in the log already comes from. On
   * Android only the "Did" events fire, so this arrives once the keyboard
   * has finished moving — which is all that is needed here. This number
   * becomes scrollable room at the bottom of the list, not an animation.
   */
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (e) =>
      setKbHeight(e.endCoordinates.height),
    );
    const hidden = Keyboard.addListener("keyboardDidHide", () =>
      setKbHeight(0),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  /*
   * Bring the row being edited out from under the keyboard.
   *
   * IT DEPENDS ON kbHeight AS WELL AS editId, and that is the whole
   * mechanism. Tapping Edit and the keyboard appearing are two different
   * moments: the pill's field has autoFocus, so the keyboard arrives a beat
   * later and brings the extra room with it. Run on editId alone and the
   * scroll happens while the list still ends 40 below the last row — it gets
   * clamped short and the row stays half covered, with nothing thrown.
   *
   * A row with no recorded position has not been laid out yet; its own
   * onLayout will arrive and this runs again on the next change.
   */
  useEffect(() => {
    if (editId === null) return;
    const y = rowTopsRef.current[editId];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({
      y: Math.max(0, y - SCROLL_GAP),
      animated: true,
    });
  }, [editId, kbHeight]);

  /*
   * Keeps `items` true while this tab stays mounted. Two moments:
   *
   *   on focus       the version moved while this tab was hidden — for
   *                  example a category made in the add sheet on Home, or
   *                  an icon picked on a category page.
   *   while focused  listen. A category made in the add sheet opened from
   *                  this tab's + lands while this list is on screen.
   *                  Re-read when the version is not this screen's own.
   *
   * A re-read sorts the list by name. That is safe here because neither
   * moment happens under a finger on this list: the first is a tab switch,
   * the second happens while the add sheet covers the list.
   *
   * This screen holds no expense money — the delete dialog reads readTotals
   * fresh when Delete is tapped — so it does not listen to the expense
   * counter.
   *
   * Empty dependencies: created once. Safe because readFresh only uses
   * readCategories, readCategoryIcons, two setters and a ref — no state.
   *
   * The dev lines print every time, including "up to date" and "own write",
   * so a check that never ran cannot look like one that ran and found
   * nothing.
   */
  useFocusEffect(
    useCallback(() => {
      const readFresh = () => {
        setItems(readCategories());
        /* Both reads together, for the same reason the two initialisers are
         * together: the names and the icons on screen should always be from
         * the same moment. */
        setIcons(readCategoryIcons());
        seenRef.current = categoryVersion();
      };

      const version = categoryVersion();
      const seen = seenRef.current;
      const stale = version !== seen;
      if (__DEV__) {
        console.log(
          `[categories] check: version ${version}, seen ${seen} → ` +
            (stale ? "re-read" : "up to date"),
        );
      }
      if (stale) readFresh();

      return onCategoriesChanged(() => {
        const version = categoryVersion();
        const seen = seenRef.current;
        const own = version === seen;
        if (__DEV__) {
          console.log(
            `[categories] heard: version ${version}, seen ${seen} → ` +
              (own ? "own write, nothing" : "re-read"),
          );
        }
        if (!own) readFresh();
      });
    }, []),
  );

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
    /* No row, so no circle, so no icon can be picked while adding. Cleared
     * anyway, so a leftover draft from a previous Edit cannot survive. */
    setIconDraft(null);
    setError(null);
    setOpen(true);
  };

  const openEdit = (item: Category) => {
    animate();
    setEditId(item.id);
    setDraft(item.name);
    /* Seeded from what is stored, so the draft always means something while
     * editing and nothing has to tell "untouched" apart from "cleared". */
    setIconDraft(icons[item.id] ?? null);
    setError(null);
    setOpen(true);
    /* The scroll is NOT done here. See the effect above: the room to scroll
     * into does not exist until the keyboard has arrived. */
  };

  /*
   * The editing row's circle was tapped. Open the catalog.
   *
   * The keyboard goes first. The pill's field has autoFocus, so it is up, and
   * the sheet slides in from the bottom — the same place. The add form already
   * follows this rule: opening its category list calls Keyboard.dismiss(),
   * because a Pressable never takes focus away by itself.
   */
  const openIconPicker = () => {
    Keyboard.dismiss();
    setPickerOpen(true);
  };

  /*
   * Open a category's own page, pushed INSIDE this tab's stack, so the tab
   * bar stays on screen and ‹ comes back to this list.
   *
   * The id, not the name. A name can hold "/", "%" or "?" and would have to
   * be encoded on the way through a URL; an id passes through unchanged.
   * Same rule as /title/[id].
   */
  const openCategory = (item: Category) => {
    router.push({ pathname: "/category/[id]", params: { id: item.id } });
  };

  // Not a nicety. Without a way out, tapping Edit puts the screen in a mode
  // it cannot leave — the row stays struck through and the field stays
  // loaded. Restyle it however you like, but something has to do this.
  const cancel = () => {
    animate();
    setOpen(false);
    setEditId(null);
    setDraft("");
    /* The picked icon is thrown away with the typed name. Nothing was
     * written, so there is nothing to undo. */
    setIconDraft(null);
    setPickerOpen(false);
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
        seenRef.current = categoryVersion();
      } else {
        const id = editId;
        const savedName = items.find((c) => c.id === id)?.name ?? "";
        const savedIcon = icons[id] ?? null;
        // .trim() mirrors what cleanCategoryName already does to the value
        // that reaches the database. Skip it and the screen shows "Food "
        // while the row says "Food".
        const clean = draft.trim();

        /*
         * Only what actually changed is written, and the NAME goes first.
         *
         * Each write bumps the categories counter, and every screen holding a
         * copy of this table re-reads when it hears one — so writing a value
         * back unchanged costs reads and redraws across the app for nothing.
         *
         * Name first because it is the one that can throw: a duplicate, or an
         * empty string. Thrown there, the icon has not been touched at all.
         * Two writes, not one transaction — the same shape as saveRename on
         * the category page.
         */
        if (clean !== savedName) renameCategory(id, draft);
        if (iconDraft !== savedIcon) setCategoryIcon(id, iconDraft);

        /* Own write. Marked seen BEFORE the listener runs, so the listener
         * does not re-read — a re-read would sort, and move this row. */
        seenRef.current = categoryVersion();

        // Patch the one NAME instead of re-reading the list.
        //
        // readCategories sorts by name, so a re-read would move the row you
        // just edited to a new position — Food becoming Zomato jumps to the
        // bottom of the list under your finger. The row stays where it is
        // until the list is next re-read: another category write anywhere,
        // or an app restart.
        setItems((prev) =>
          prev.map((c) => (c.id === id ? { ...c, name: clean } : c)),
        );

        /* The icons, unlike the names, ARE re-read. The map is keyed by id
         * and nothing on screen is ordered by it, so re-reading it cannot
         * move a row — the reason the names are patched does not apply. */
        setIcons(readCategoryIcons());
      }
      cancel();
    } catch (err) {
      // Deliberately does NOT call cancel(). The field keeps what was typed
      // and the picked icon, so both can be corrected, and the row stays
      // struck through.
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
        /* The deleted category's icon has to leave the map with it, or the
         * map keeps an entry for a row nobody can see. */
        setIcons(readCategoryIcons());
        /* Its remembered position goes too. Every other row is about to move
         * up, and a stale y would scroll to the wrong place. */
        delete rowTopsRef.current[id];
        /* Own write, already re-read on the lines above. deleteCategory
         * bumps the expense counter too; the list screens catch that on
         * their own focus check. */
        seenRef.current = categoryVersion();
        // The deleted row may be the one loaded into the field.
        if (editId === id) {
          setOpen(false);
          setEditId(null);
          setDraft("");
          setIconDraft(null);
          setPickerOpen(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
        setPending(null);
      }
    }, 0);
  };

  /* The colour the catalog draws a picked icon in: the editing category's
   * own, derived from its id by the same function every circle uses. */
  const pickerShade =
    editId === null ? PLACEHOLDER_SHADE : shadeForCategory(editId);

  return (
    <SafeAreaView style={styles.screen} edges={SAFE_EDGES}>
      {/* No header options here any more: the tab layout switches the
          navigator's header off for every tab. */}

      <View style={styles.header}>
        {/* In the tab bar, back means the first tab, Home: the tab router's
            backBehavior is 'firstRoute' unless told otherwise. */}
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
              /* 5.22 against the pill's surface, computed. The old #5A606B
               * read 2.69 on it. */
              placeholderTextColor="#8E8E93"
              autoFocus
              // Enter on the keyboard does the same thing as the knob.
              onSubmitEditing={save}
              returnKeyType="done"
            />
          ) : (
            // The label is pressable too, so the whole pill opens, not just
            // the 64px circle.
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
      <ScrollView
        ref={scrollRef}
        /* The keyboard's own height becomes extra room at the bottom, so the
           last row can be scrolled up above it. Without this the list simply
           ends 40 below the last card and there is nowhere for it to go.
           An array rather than a second StyleSheet entry, because the number
           changes while the app runs. */
        contentContainerStyle={[styles.list, { paddingBottom: 40 + kbHeight }]}
        // The pill's TextInput has autoFocus, so opening Add puts the
        // keyboard up with these rows still on screen. Under the default,
        // "never", the first tap on Edit, Delete or a circle would only
        // close the keyboard, and the row would never receive it.
        keyboardShouldPersistTaps="handled"
      >
        <CategoryManageList
          items={items}
          icons={icons}
          editingId={editId}
          draftIcon={iconDraft}
          undeletableId={UNCATEGORISED_ID}
          /* The same id, through a second prop. Two questions — can this be
           * deleted, can this be given an icon — that happen to share an
           * answer today. */
          noIconId={UNCATEGORISED_ID}
          onOpen={openCategory}
          onEdit={openEdit}
          onDelete={askDelete}
          onPickIcon={openIconPicker}
          onRowLayout={onRowLayout}
        />
      </ScrollView>

      {/* The icon catalog. Rendered only while a row is being edited, so
          nothing holds a 1,357-cell list in the tree the rest of the time. */}
      {editId !== null && editId !== UNCATEGORISED_ID && (
        <IconPicker
          visible={pickerOpen}
          selected={iconDraft}
          color={pickerShade.color}
          tint={pickerShade.tint}
          /* Picking fills the circle and closes the sheet. NOTHING is written
             until ✓ — see save. */
          onPick={(name) => {
            setIconDraft(name);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

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
  // YOURS TO RESTYLE. Black, like every other screen in the app.
  screen: { flex: 1, backgroundColor: "#000000" },

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
  //
  // No border any more. No other card in the app has one, and on black the
  // old #2A2F38 hairline read 1.56 — a line doing nothing the surface was
  // not already doing.
  pill: {
    alignItems: "center",
    // Full width in BOTH states now, so it lives here rather than in the
    // two variants below.
    alignSelf: "stretch",
    minHeight: 80,
    borderRadius: 40,
    padding: 8,
  },
  // The ONLY difference between the two states is which way the row runs.
  // row-reverse paints the last child first, which is what puts the knob on
  // the left without moving it in the JSX.
  //
  // Both carry the app's card colour, 1.23 against the black page — the same
  // pair as every list card. They used to differ, so the sentence above is
  // only now literally true.
  pillClosed: {
    flexDirection: "row-reverse",
    backgroundColor: "#1C1C1E",
  },
  pillOpen: {
    flexDirection: "row",
    backgroundColor: "#1C1C1E",
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
  error: {
    color: "#E5484D",
    fontSize: 13,
    paddingTop: 8,
    paddingHorizontal: 12,
  },

  /*
   * The cards are inset 12 from the screen's edges and start 10 below the
   * pill — the same two numbers as styles.list in
   * comp/ExpenseListScreen.tsx, so the two lists line up with each other.
   *
   * paddingBottom is set at the call site, not here: it grows by the
   * keyboard's height while the keyboard is up.
   */
  list: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  /* The app's card colour, 1.23 against the dimmed black page — the same
   * reading a list card gets against the page it sits on. */
  dialog: {
    width: "100%",
    backgroundColor: "#1C1C1E",
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
});