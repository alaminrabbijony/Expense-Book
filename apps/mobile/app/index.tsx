import BottomSheet from "@/comp/BottomSheet";
import CategorySheet, { type CategoryChoice } from "@/comp/CategorySheet";
import ExpenseForm from "@/comp/ExpenseForm";
import {
  deleteExpense,
  insertExpense,
  listExpensePage,
  readCategories,
  readExpenseForEdit,
  readTotals,
  restoreExpense,
  updateExpense,
} from "@/db/expenses";
import type { DeletedExpense, Expense, ExpenseForEdit } from "@/db/expenses";
import {
  clearSeedExpenses,
  countRowSources,
  createCategoryCompositeIndex,
  createCategoryIndex,
  createListIndex,
  dropCategoryIndexes,
  dropListIndex,
  explainFilteredPlans,
  explainListPage,
  listIndexes,
  probeCategoryFkOnInsert,
  probeCategoryWrites,
  probeExpenseDelete,
  probeExpenseWrites,
  probeForeignKeys,
  readUserVersion,
  seedFakeExpenses,
  timeCategoryReads,
  timeFilteredPages,
  timePages,
} from "@/db/devTools";
import { asMinor, DEFAULT_CURRENCY, formatMoney, type Minor } from "@et/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";

/*
 * One expense row, swipeable.
 *
 * This is its own component for one reason: each row needs its own ref. A ref
 * created inside renderItem would be a brand new object on every render and
 * would never point at anything useful.
 *
 * That ref is what lets code OUTSIDE the row close it — after a save, or when
 * a different row opens. A swipeable keeps its open/closed position
 * internally and is never told that anything happened elsewhere on screen.
 */
function ExpenseRow({
  expense,
  onEdit,
  onDelete,
  onWillOpen,
}: {
  expense: Expense;
  onEdit: (e: Expense, methods: SwipeableMethods | null) => void;
  onDelete: (e: Expense) => void;
  onWillOpen: (methods: SwipeableMethods | null) => void;
}) {
  const swipeRef = useRef<SwipeableMethods | null>(null);

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      // How far the panel lags behind the finger. 1 follows exactly,
      // 2 is half speed.
      friction={2}
      // Drag further left than this and releasing snaps the row OPEN.
      // Less than this and it springs back closed.
      rightThreshold={40}
      // Fires when this row STARTS opening, not when it finishes. The "will"
      // version means the previously open row closes at the same moment,
      // rather than a beat later with both visibly open.
      onSwipeableWillOpen={() => onWillOpen(swipeRef.current)}
      // Returns what sits UNDERNEATH the row, revealed as it slides.
      renderRightActions={() => (
        /*
         * One wrapper View, not two buttons side by side. The swipeable lays
         * its actions area out right to left, so two bare buttons would come
         * out as Delete, Edit. Inside a row they keep the order written here.
         */
        <View style={styles.rowActions}>
          <Pressable
            style={styles.rowAction}
            // The handle is handed UP to the parent rather than used here.
            // Closing on Save happens inside saveEdit, which runs long after
            // this onPress has finished, so the parent is the only place that
            // can still reach this row by then.
            onPress={() => onEdit(expense, swipeRef.current)}
          >
            <Text style={styles.rowActionText}>Edit</Text>
          </Pressable>
          <Pressable
            style={styles.rowAction}
            // No handle passed up. This row is about to be removed, so
            // nothing will ever need to close it.
            onPress={() => onDelete(expense)}
          >
            <Text style={styles.rowActionText}>Delete</Text>
          </Pressable>
        </View>
      )}
    >
      {/* rowSurface is MECHANISM, not looks. styles.row has no
          backgroundColor, so the buttons behind it would show through
          the title and the amount during the slide. */}
      <View style={[styles.row, styles.rowSurface]}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowTitle}>{expense.title}</Text>
        </View>
        <Text style={styles.rowAmount}>
          {formatMoney(expense.amountMinor, expense.currencyCode)}
        </Text>
      </View>
    </ReanimatedSwipeable>
  );
}

/*
 * Puts a row back where the list query would have put it: newest first, with
 * id breaking ties — the same order as ORDER BY created_at DESC, id DESC.
 *
 * By sort order, not by the index the row was deleted from. A remembered
 * index is only right while no row above it moves; the sort order is right
 * whatever happens in between.
 *
 * `r.id < row.id` agrees with SQLite's ordering here because every id is
 * plain ASCII — digits, lowercase letters and dashes — and for ASCII text
 * JavaScript and SQLite compare character by character the same way.
 */
const insertInSortOrder = (list: Expense[], row: Expense): Expense[] => {
  const at = list.findIndex(
    (r) =>
      r.createdAt < row.createdAt ||
      (r.createdAt === row.createdAt && r.id < row.id),
  );
  return at === -1
    ? [...list, row]
    : [...list.slice(0, at), row, ...list.slice(at)];
};

export default function Index() {
  // How many rows we have already pulled out of the database.
  // A REF, not state — onEndReached can fire twice before React
  // redraws, and state would still be showing the old number.
  const offsetRef = useRef(0);

  /*
   * The row that is currently swiped open, so something else can close it.
   *
   * A ref, not state. Nothing re-renders when this changes — closing is done
   * by calling a method on the row, not by React drawing anything.
   *
   * Written when a row starts opening and when its Edit button is tapped.
   * Cleared when the form closes and when the row is deleted. Read by
   * closePreviousRow and closeForm.
   */
  const openRowRef = useRef<SwipeableMethods | null>(null);

  const [rows, setRows] = useState<Expense[]>(() => {
    const t0 = Date.now();
    const first = listExpensePage(0);
    console.log(`first page: ${first.length} rows in ${Date.now() - t0}ms`);
    offsetRef.current = first.length;
    return first;
  });

  const [totals, setTotals] = useState(() => readTotals());

  // null means no filter. Holds the name too, so the header can show it
  // without a second lookup.
  const [filter, setFilter] = useState<CategoryChoice>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  /*
   * The row being edited, or null when adding a new one.
   *
   * THIS IS THE DANGEROUS PIECE OF STATE ON THIS SCREEN. If it survives the
   * sheet closing, the next tap on the FAB opens a form pre-filled with the
   * last row you edited, with a Save button. Typing a new expense over it and
   * saving overwrites that row instead of adding anything.
   *
   * Two places clear it: closeForm on the way out, openAdd on the way in.
   * Only one of them has to be forgotten for the bug to come back, so both
   * are here on purpose.
   */
  const [editing, setEditing] = useState<ExpenseForEdit | null>(null);

  /*
   * The deleted row that Undo can still bring back, or null.
   *
   * THIS IS THE ONLY COPY OF THAT ROW ANYWHERE. deleteExpense really deletes;
   * there is no deleted_at column to bring it back from. If the app is closed
   * while the banner shows, the row is gone for good.
   *
   * Held twice on purpose. The state draws the banner. The ref is what the
   * handlers read, for the same reason offsetRef is a ref: two taps on Undo
   * can land before React redraws, and state would still hold the copy for
   * both — the second restore would then hit the primary key. The focus
   * cleanup below is created once and never sees new state, so it needs the
   * ref too.
   *
   * holdCopy is the only thing that writes either one, so they cannot drift
   * apart.
   */
  const heldRef = useRef<DeletedExpense | null>(null);
  const [held, setHeld] = useState<DeletedExpense | null>(null);
  const holdCopy = (copy: DeletedExpense | null) => {
    heldRef.current = copy;
    setHeld(copy);
  };

  /*
   * Ends the undo window: forgets the held copy, which hides the banner.
   *
   * Nothing is written to the database here. The row already left it when
   * Delete was tapped — there is nothing left to commit.
   *
   * `reason` exists only for the dev log, so every way of ending the window
   * leaves a line saying which one it was.
   */
  const endUndoWindow = (reason: string) => {
    if (!heldRef.current) return;
    holdCopy(null);
    if (__DEV__) console.log(`undo window ended by ${reason}`);
  };

  /*
   * Whether a finger has dragged the list since the last delete.
   *
   * Scrolling far enough to load a page ends the undo window. But a page can
   * also load with no scroll at all: removing a row changes the list's
   * content size, and the list runs its end-of-list check on every
   * content-size change, not only on scroll. Without this flag, deleting a
   * row near the bottom could load the next page by itself and take the Undo
   * banner away before anyone could tap it.
   */
  const draggedSinceDeleteRef = useRef(false);

  /*
   * Dev-only check that the offset still matches the list.
   *
   * Every write on this screen moves offsetRef and rows together: a page
   * load adds the same number to both, and a row leaving takes one from
   * both. So after any change to rows the two should be equal. A patch that
   * forgets the offset shows up here the moment it happens, instead of as a
   * skipped or doubled row at the next page boundary.
   */
  useEffect(() => {
    if (!__DEV__) return;
    const flag = offsetRef.current === rows.length ? "" : "  <-- MISMATCH";
    console.log(`offset ${offsetRef.current} / rows ${rows.length}${flag}`);
  }, [rows]);

  // Go back to page one and re-read the total, keeping whatever filter
  // is currently applied. Called after anything that changes the table.
  //
  // Safe to read `filter` from state here: reload only ever runs from an
  // event handler, after the render that set it.
  const reload = () => {
    // The list the held row's position belonged to is about to be replaced.
    endUndoWindow("reload");

    const categoryId = filter?.id;

    const first = listExpensePage(0, categoryId);
    offsetRef.current = first.length;
    setRows(first);
    setTotals(readTotals(categoryId));
  };

  // Switch filter. Takes the choice as an ARGUMENT, never from state —
  // setFilter below does not update `filter` until the next render, so
  // reading it back here would apply the previous tap's category.
  const applyFilter = (choice: CategoryChoice) => {
    /* Page one of a different set, with totals for a different filter. The
     * held row's position belonged to the list being thrown away, so undo
     * would have nowhere honest to put it. addExpense ends up here too. */
    endUndoWindow("applyFilter");

    const categoryId = choice?.id;

    const first = listExpensePage(0, categoryId);
    // Page one of a different set. The offset MUST go back to zero, or
    // switching from one category to another asks for rows 300-350 of a set
    // with none.
    offsetRef.current = first.length;
    // REPLACE, never append. Appending leaves one category's rows above
    // another's.
    setRows(first);
    // The header total narrows with the list. A list showing one category
    // above a total showing everything is a screen that lies quietly.
    setTotals(readTotals(categoryId));

    setFilter(choice);
    setSheetOpen(false);
  };

  // The only thing on this screen that a trip to /categories can break.
  //
  // CategorySheet re-reads on [visible], so its numbers look after
  // themselves. This state does not — delete the filtered category over
  // there and `filter` still holds an id with no row behind it. The list
  // then returns 0 rows and readTotals returns ৳0, both correct, while the
  // header still names the category. Nothing throws and nothing logs.
  //
  // useFocusEffect runs every time this screen becomes the visible one,
  // where useEffect with [] would only run once at mount. useCallback is
  // required — without it the callback is a new function every render and
  // the effect re-runs forever.
  useFocusEffect(
    useCallback(() => {
      if (!filter) return;
      const stillThere = readCategories().some((c) => c.id === filter.id);
      if (!stillThere) applyFilter(null);
    }, [filter]),
  );

  /*
   * Leaving the screen ends the undo window.
   *
   * /categories can delete the category the held row points at. Foreign
   * keys are enforced, so a restore after coming back would throw. Today the
   * only way off this screen goes through the ⋯ sheet, which ends the window
   * first — this is the backstop for whatever route gets added next.
   *
   * The function returned is the cleanup, and it runs when the screen loses
   * focus. Empty dependencies, so it is created once. That is safe because
   * endUndoWindow only touches refs and a state setter, and neither changes
   * between renders.
   */
  useFocusEffect(
    useCallback(() => {
      return () => endUndoWindow("leaving the screen");
    }, []),
  );

  const loadMore = () => {
    // totals.count is the FILTERED count, so this guard already knows when
    // it has reached the end of an empty category.
    if (offsetRef.current >= totals.count) {
      return;
    }

    // The filter has to reach here too. Miss it and scrolling to the bottom
    // of one category quietly starts appending another's rows underneath.
    const next = listExpensePage(offsetRef.current, filter?.id);
    offsetRef.current += next.length;
    setRows((prev) => [...prev, ...next]);

    /* A page loading ends the undo window only when a finger caused it.
     * See draggedSinceDeleteRef. */
    if (draggedSinceDeleteRef.current) endUndoWindow("loadMore");
  };

  /* ─── Swipe bookkeeping ─────────────────────────────────────────────── */

  /*
   * Remember which row is open, and close whichever was open before it.
   *
   * TO ALLOW SEVERAL ROWS OPEN AT ONCE, delete the three lines inside the
   * `if`. Keep the assignment below it — that is what close-on-save reads.
   */
  const closePreviousRow = (opening: SwipeableMethods | null) => {
    /* Any row starting to open ends the undo window. Reaching the next
     * Delete button takes a swipe, which is why two deletes never overlap. */
    endUndoWindow("swipe");

    // The !== guard matters. A row re-opening itself would otherwise be told
    // to close in the middle of opening, and the swipe would look dead.
    if (openRowRef.current && openRowRef.current !== opening) {
      openRowRef.current.close();
    }
    openRowRef.current = opening;
  };

  /* ─── Opening and closing the form ──────────────────────────────────── */

  const openAdd = () => {
    endUndoWindow("openAdd");

    // Clears any leftover edit target. See the comment on `editing`.
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (e: Expense, methods: SwipeableMethods | null) => {
    /* A backstop. The swipe that revealed this Edit button has already ended
     * the window, so this only logs if Edit ever becomes reachable some
     * other way. */
    endUndoWindow("openEdit");

    /*
     * Read the row fresh rather than using the object already in `rows`.
     *
     * That object came from the list query, which does not select
     * category_id — so it cannot tell the form which category to show. This
     * lookup is by PRIMARY KEY and measured at 2-3ms warm, which is cheaper
     * than widening the list query and invalidating its recorded timings.
     */
    const full = readExpenseForEdit(e.id);

    /* On screen but gone from the database. The list is stale, so there is
     * nothing to edit, and opening an empty form would be worse than doing
     * nothing at all. */
    if (!full) return;

    /* Point the ref at THIS row before the sheet opens. Tapping Edit does not
     * by itself mean this row was the last one swiped, and a stale handle
     * here would close the wrong row on save. */
    openRowRef.current = methods;

    // Both setters run in one event handler, so React batches them into a
    // single render. The Modal becomes visible and ExpenseForm mounts with
    // `editing` already set, which is what its initialisers read.
    setEditing(full);
    setFormOpen(true);
  };

  const closeForm = () => {
    /*
     * Close the swiped row on the way out — after Save, after Add, and after
     * dismissing the sheet without saving.
     *
     * saveEdit calls this AFTER its setRows, and that is still in time. React
     * applies state updates only once the whole handler has returned, so the
     * row is still mounted when it is told to close. openEdit's two setters
     * rely on the same batching.
     */
    openRowRef.current?.close();
    openRowRef.current = null;

    setFormOpen(false);
    setEditing(null);
  };

  /* ─── Writes ────────────────────────────────────────────────────────── */

  const addExpense = (
    title: string,
    amountMinor: Minor,
    currency: string,
    categoryId: string,
  ) => {
    insertExpense(title, amountMinor, currency, categoryId);

    // Clear the filter instead of calling reload().
    //
    // Adding an expense while filtered to another category inserts a row you
    // cannot see, the sheet closes, and nothing on screen moves. It looks
    // broken and it is not.
    //
    // applyFilter(null) already resets the offset, replaces the rows and
    // re-reads the total, so this is reload() plus dropping the filter.
    applyFilter(null);

    closeForm();
  };

  /*
   * The edit write, and the three places it has to reach.
   *
   * There is no re-read here on purpose. reload() would be two lines, and it
   * would also throw away however far the list has been scrolled. So the
   * screen is patched by hand instead, and each of the three has its own
   * rule:
   *
   *   rows       the array being displayed
   *   totals     the count and the money in the header, read separately
   *   offsetRef  how many rows have already been pulled from the database
   *
   * Miss one and nothing throws. offsetRef is the worst of the three: leave
   * it too high after a row leaves and the next loadMore asks for a position
   * that has shifted, so exactly one unseen row is skipped, permanently.
   *
   * The swiped row is closed by closeForm, at the end.
   */
  const saveEdit = (
    target: ExpenseForEdit,
    title: string,
    amountMinor: Minor,
    currency: string,
    categoryId: string,
  ) => {
    updateExpense(target.id, title, amountMinor, currency, categoryId);

    /* Does this row still belong in what is on screen? With no filter
     * everything belongs, so it always stays. */
    const stillInFilter = !filter || filter.id === categoryId;

    if (stillInFilter) {
      /*
       * map, not filter. Replaces one element and keeps the array length, so
       * the row stays exactly where it is. created_at was not written, so its
       * position in the sort has not moved either.
       */
      setRows((prev) =>
        prev.map((r) =>
          r.id === target.id
            ? { ...r, title, amountMinor, currencyCode: currency }
            : r,
        ),
      );

      /* target.amountMinor is the OLD amount, read when the sheet opened.
       * Subtract it and add the new one. */
      setTotals((t) => ({
        count: t.count,
        totalMinor: asMinor(t.totalMinor - target.amountMinor + amountMinor),
      }));

      /* offsetRef is deliberately untouched. The list is the same length, so
       * the next page still starts in the same place. */
    } else {
      /* filter, not map. The array gets shorter by one. */
      setRows((prev) => prev.filter((r) => r.id !== target.id));

      setTotals((t) => ({
        count: t.count - 1,
        totalMinor: asMinor(t.totalMinor - target.amountMinor),
      }));

      /*
       * THE LINE THAT BREAKS SILENTLY IF IT IS MISSING.
       *
       * A row left the filtered set, so every row after it in the database
       * moved down one position. This counter says how many rows we have
       * already taken. Leave it one too high and the next page starts one row
       * too late, and that row is never seen.
       */
      offsetRef.current -= 1;
    }

    closeForm();
  };

  /* One handler for both modes. `editing` decides which write runs. Safe to
   * read from state here for the same reason reload() reads `filter`: this
   * only runs from an event handler, after the render that set it. */
  const submitExpense = (
    title: string,
    amountMinor: Minor,
    currency: string,
    categoryId: string,
  ) => {
    if (editing) {
      saveEdit(editing, title, amountMinor, currency, categoryId);
    } else {
      addExpense(title, amountMinor, currency, categoryId);
    }
  };

  /* ─── Delete and undo ───────────────────────────────────────────────── */

  /*
   * Delete a row, and keep a copy so Undo can bring it back.
   *
   * The same three places as saveEdit's leaving-the-filter branch, with the
   * test removed: a deleted row always leaves the list, so the offset always
   * moves.
   */
  const deleteRow = (e: Expense) => {
    /* A second delete while the banner shows makes the first one final. In
     * practice the swipe that revealed this button has already ended the
     * window, so this only logs if that ever stops being true. */
    endUndoWindow("deleteRow");

    /* The database first. If this throws, none of the screen changes below
     * happen, so the screen cannot show a delete that did not occur. */
    const copy = deleteExpense(e.id);

    /* The Delete button sits inside the only open row, and that row is about
     * to unmount. Forget its handle, so the next swipe does not try to close
     * a row that is gone. */
    openRowRef.current = null;

    setRows((prev) => prev.filter((r) => r.id !== copy.id));
    setTotals((t) => ({
      count: t.count - 1,
      totalMinor: asMinor(t.totalMinor - copy.amountMinor),
    }));
    /* Same line, same reason, as in saveEdit. */
    offsetRef.current -= 1;

    holdCopy(copy);
    draggedSinceDeleteRef.current = false;
  };

  /*
   * Put the held row back, and patch the same three places back.
   *
   * THE OFFSET IS THE ONE THAT BREAKS SILENTLY HERE. The row is back in the
   * database, in front of where the next page starts. Forget the + 1 and the
   * next loadMore starts one row early, and one row shows up twice.
   */
  const undoDelete = () => {
    const copy = heldRef.current;
    /* A second tap before React redraws finds nothing held and stops here. */
    if (!copy) return;

    /* The database first, as in deleteRow. If the restore throws, the copy
     * stays held and the banner stays up. */
    restoreExpense(copy);

    /*
     * Rebuilt field by field so the list holds exactly what the list query
     * would have returned. A categoryId left on the object would ride along
     * through saveEdit's spread and go stale the first time the row's
     * category is edited.
     */
    const row: Expense = {
      id: copy.id,
      title: copy.title,
      amountMinor: copy.amountMinor,
      currencyCode: copy.currencyCode,
      createdAt: copy.createdAt,
    };
    setRows((prev) => insertInSortOrder(prev, row));
    setTotals((t) => ({
      count: t.count + 1,
      totalMinor: asMinor(t.totalMinor + copy.amountMinor),
    }));
    offsetRef.current += 1;

    endUndoWindow("undoDelete");
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {/* numberOfLines is what actually truncates. flex: 1 alone just
              gives the text room, and a long name would wrap to a second
              line and push the total down. */}
          <Text style={styles.headerLabel} numberOfLines={1}>
            {filter ? filter.name : "Spent Recently"}
          </Text>

          {/* The 3-dot. When the week filter arrives it opens a small menu
              first, and this becomes onPress={() => setMenuOpen(true)}. */}
          <Pressable
            onPress={() => {
              endUndoWindow("⋯ sheet");
              setSheetOpen(true);
            }}
            hitSlop={12}
          >
            <Text style={styles.dots}>⋯</Text>
          </Pressable>
        </View>

        <Text style={styles.headerTotal}>
          {formatMoney(totals.totalMinor, DEFAULT_CURRENCY)}
        </Text>
      </View>

      {/* The undo banner, shown for as long as a deleted row is held.

          YOURS TO RESTYLE AND TO MOVE — this is the plain version. The one
          piece of mechanism is the condition: it reads `held`, so it
          disappears exactly when the window ends, whatever ended it. */}
      {held && (
        <View style={styles.undoBanner}>
          <Text style={styles.undoText} numberOfLines={1}>
            {`Deleted "${held.title}" (${formatMoney(
              held.amountMinor,
              held.currencyCode,
            )})`}
          </Text>
          <Pressable onPress={undoDelete} hitSlop={12}>
            <Text style={styles.undoAction}>Undo</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        // Fires when a finger starts dragging the list — not when the
        // content changes size. That difference is the whole point of the
        // flag it sets.
        onScrollBeginDrag={() => {
          draggedSinceDeleteRef.current = true;
        }}
        ListEmptyComponent={
          <Text style={styles.footer}>
            Nothing in {filter ? filter.name : "this list"} yet.
          </Text>
        }
        // Both Empty and Footer render when there is no data, so an empty
        // filter would stack "Nothing in X yet." above "Showing 0 of 0".
        ListFooterComponent={
          rows.length > 0 ? (
            <Text style={styles.footer}>
              Showing {rows.length} of {totals.count}
            </Text>
          ) : null
        }
        renderItem={({ item: e }) => (
          <ExpenseRow
            expense={e}
            onEdit={openEdit}
            onDelete={deleteRow}
            onWillOpen={closePreviousRow}
          />
        )}
      />

      {__DEV__ && (
        <View style={styles.devRow}>
          <Pressable
            style={styles.devButton}
            onPress={() => {
              const t0 = Date.now();
              seedFakeExpenses(50000);
              console.log(`seed: ${Date.now() - t0}ms`);
              reload();
            }}
          >
            <Text style={styles.devButtonText}>Seed 50k</Text>
          </Pressable>
          <Pressable
            style={styles.devButton}
            onPress={() => {
              clearSeedExpenses();
              reload();
            }}
          >
            <Text style={styles.devButtonText}>Clear seed</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={explainListPage}>
            <Text style={styles.devButtonText}>Explain plan</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={timePages}>
            <Text style={styles.devButtonText}>Time pages</Text>
          </Pressable>
          {/* These are inside the guard because dropListIndex in a real
              user's hands is unrecoverable. */}
          <Pressable style={styles.devButton} onPress={createListIndex}>
            <Text style={styles.devButtonText}>Add index</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={dropListIndex}>
            <Text style={styles.devButtonText}>Drop index</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={readUserVersion}>
            <Text style={styles.devButtonText}>Version</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={probeForeignKeys}>
            <Text style={styles.devButtonText}>Probe FKs</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={countRowSources}>
            <Text style={styles.devButtonText}>Count rows</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={listIndexes}>
            <Text style={styles.devButtonText}>listIndexes</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={explainFilteredPlans}>
            <Text style={styles.devButtonText}>explainFilteredPlans</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={timeFilteredPages}>
            <Text style={styles.devButtonText}>timeFilteredPages</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={createCategoryIndex}>
            <Text style={styles.devButtonText}>createCategoryIndex</Text>
          </Pressable>
          <Pressable
            style={styles.devButton}
            onPress={createCategoryCompositeIndex}
          >
            <Text style={styles.devButtonText}>
              createCategoryCompositeIndex
            </Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={dropCategoryIndexes}>
            <Text style={styles.devButtonText}>dropCategoryIndexes</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={probeCategoryFkOnInsert}>
            <Text style={styles.devButtonText}>FK on insert</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={timeCategoryReads}>
            <Text style={styles.devButtonText}>Time category reads</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={probeCategoryWrites}>
            <Text style={styles.devButtonText}>probeCategoryWrites</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={probeExpenseWrites}>
            <Text style={styles.devButtonText}>probeExpenseWrites</Text>
          </Pressable>
          <Pressable style={styles.devButton} onPress={probeExpenseDelete}>
            <Text style={styles.devButtonText}>probeExpenseDelete</Text>
          </Pressable>
        </View>
      )}

      {/* Floats over the list. Last in the tree so it draws on top of the
          rows without needing zIndex. */}
      <Pressable style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabPlus}>+</Text>
      </Pressable>

      <CategorySheet
        visible={sheetOpen}
        selectedId={filter?.id ?? null}
        onSelect={applyFilter}
        onClose={() => setSheetOpen(false)}
        onManage={() => {
          // Close FIRST. CategorySheet is a react-native Modal, which draws
          // above the navigator — push while it is open and it stays on top
          // of the screen you just pushed.
          setSheetOpen(false);
          router.push("/categories" as never);
        }}
      />

      <BottomSheet
        visible={formOpen}
        title={editing ? "Edit expense" : "New expense"}
        onClose={closeForm}
      >
        {/*
          key forces a fresh mount whenever the target changes.

          ExpenseForm reads `initial` in its useState initialisers, which run
          on mount only. A hidden Modal already unmounts its children, so this
          is belt and braces — but it is one string and it makes the pre-fill
          correct even if the sheet ever stops unmounting.
        */}
        <ExpenseForm
          key={editing?.id ?? "new"}
          initial={editing}
          submitLabel={editing ? "Save" : "Add expense"}
          onSubmit={submitExpense}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F1115" },
  header: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16 },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLabel: {
    color: "#8A8F98",
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    // Gives the label room so it does not squeeze the dots. The
    // truncation itself is numberOfLines on the Text, not this.
    flex: 1,
  },
  dots: { color: "#8A8F98", fontSize: 20, paddingHorizontal: 4 },
  headerTotal: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "700",
    marginTop: 4,
  },

  // YOURS TO RESTYLE — the plain undo banner.
  undoBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#22262E",
  },
  undoText: { color: "#ECEDEE", fontSize: 14, flex: 1, paddingRight: 12 },
  undoAction: { color: "#E5484D", fontSize: 14, fontWeight: "700" },

  // The FAB floats over the bottom-right corner, so the last row needs
  // clearance or it sits under the button and cannot be read.
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#22262E",
  },
  rowLeft: { flex: 1, paddingRight: 12 },
  rowTitle: { color: "#ECEDEE", fontSize: 16, fontWeight: "500" },
  rowAmount: {
    color: "#ECEDEE",
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },

  // Mechanism, not styling. See the comment in ExpenseRow.
  rowSurface: { backgroundColor: "#0F1115" },

  // Mechanism, not styling. This wrapper keeps Edit before Delete, and its
  // width — the two buttons added together — is what ReanimatedSwipeable
  // measures to decide how far the row travels when it opens.
  rowActions: { flexDirection: "row" },

  // YOURS TO RESTYLE. One thing here is mechanism: `width`. Both buttons
  // use it, so the row now travels two widths when it opens. Change it and
  // you change the throw.
  rowAction: {
    width: 88,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#22262E",
  },
  rowActionText: { color: "#ECEDEE", fontSize: 15, fontWeight: "600" },

  footer: {
    color: "#8A8F98",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 16,
  },

  fab: {
    position: "absolute",
    right: 20,
    // The dev row occupies the bottom of the screen and wraps to three
    // lines on a narrow phone. Raise this if they overlap on a real device —
    // the emulator is wider and will not show you the problem.
    bottom: __DEV__ ? 140 : 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E5484D",
    alignItems: "center",
    justifyContent: "center",
    // Two shadow systems. Android reads elevation and ignores the rest;
    // iOS is the other way round. Both are here so it lifts on both.
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabPlus: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "300",
    // Android pads text vertically with invisible space, which pushes the
    // glyph below the centre of a circle. Android-only, no effect on iOS.
    includeFontPadding: false,
    // The font's baseline is not the shape's centre, so it still sits low.
    marginTop: -2,
  },

  devRow: {
    flexDirection: "row",
    // The buttons no longer fit on one line on a narrow phone. Without
    // this, the overflow is pushed off-screen and cannot be tapped.
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  devButton: {
    backgroundColor: "#22262E",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  devButtonText: { color: "#8A8F98", fontSize: 13 },
});

