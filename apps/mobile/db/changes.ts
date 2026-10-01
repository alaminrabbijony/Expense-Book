/*
 * Change counters: one number per table that screens keep copies of.
 *
 * WHY THIS EXISTS. Tab screens stay mounted once they have been visited, and
 * each one holds its own copy of what it read: the expense lists hold rows
 * and a total, the categories screen holds the category list. A write made
 * on one tab changes the database, and every OTHER tab keeps showing what it
 * read before — with nothing thrown and nothing logged.
 *
 * So every write calls a bump for the table it changed. A bump only adds 1
 * to that table's number. A screen remembers the number it last read at, and
 * when the two differ, the screen knows its copy is old.
 *
 * ONE COUNTER PER TABLE, not one for everything. A screen re-reads only when
 * the table it SHOWS changed. With one shared number, adding a category would
 * make the expense lists re-read too, and lose their scroll, for a change
 * that moved none of their rows.
 *
 * WHO LISTENS. Only the screen that is on top. It subscribes inside
 * useFocusEffect, so it listens while focused and stops when it loses focus.
 * A hidden screen compares the number once, when it becomes focused again.
 * Nothing here re-renders anything by itself.
 *
 * WHY LISTENERS ARE TOLD LATER, IN A MICROTASK. A microtask is a callback
 * JavaScript runs as soon as the code that is running now has finished —
 * after the tap handler returns, before anything else happens.
 *
 * A screen's own delete calls deleteExpense, which bumps. If listeners were
 * called right here, inside the bump, the screen would hear about its own
 * delete before its handler had finished, and re-read for nothing — throwing
 * away the scroll and the exit animation. Told later, the handler has already
 * marked the new number as seen, and the listener finds nothing to do.
 *
 * Several bumps of one counter in one handler are told as ONE notification.
 * The listener only needs to know that something changed, not how many times.
 */

type ChangeCounter = {
  version: () => number;
  bump: (reason: string) => void;
  subscribe: (fn: () => void) => () => void;
};

/*
 * Everything a counter keeps lives INSIDE this function, so each counter
 * gets its own number, its own listeners and its own queued flag. Shared
 * between counters, the flag would let an expense bump swallow the category
 * notification queued in the same handler — deleteCategory bumps both.
 */
const makeCounter = (table: string): ChangeCounter => {
  let version = 0;
  let notifyQueued = false;
  const listeners = new Set<() => void>();

  return {
    /* Starts at 0 on every app launch, which is fine: every screen also
     * reads fresh on launch. */
    version: () => version,

    /*
     * Called AFTER the write has succeeded. A write that threw changed
     * nothing, so it must not tell anyone it did.
     *
     * `reason` is only for the dev log, so a pasted log shows which write
     * moved the number.
     */
    bump: (reason) => {
      version += 1;
      if (__DEV__) console.log(`${table} changed by ${reason}: version ${version}`);

      if (notifyQueued) return;
      notifyQueued = true;
      queueMicrotask(() => {
        notifyQueued = false;
        /* A copy, because a listener may unsubscribe while this loop runs. */
        [...listeners].forEach((fn) => fn());
      });
    },

    /* Returns the unsubscribe function, so it can be returned straight out of
     * a useFocusEffect callback as that effect's cleanup. */
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
};

/* The expense lists listen to this one: Home and All expenses. */
const expenses = makeCounter("expenses");
export const expenseVersion = expenses.version;
export const bumpExpenses = expenses.bump;
export const onExpensesChanged = expenses.subscribe;

/* The categories screen listens to this one. */
const categories = makeCounter("categories");
export const categoryVersion = categories.version;
export const bumpCategories = categories.bump;
export const onCategoriesChanged = categories.subscribe;