/*
 * The one add sheet, and the two buttons that open it.
 *
 * The sheet lives in the tab layout, so it can open over any tab. Two
 * buttons ask for it: the + in the tab bar, and the + on Home's top card.
 * Neither can reach the layout's state — the tab bar's button is drawn by the
 * navigator, and Home is a screen inside it — so both call requestAddSheet(),
 * and whoever is listening reacts.
 *
 * Two kinds of listener:
 *
 *   the tab layout           opens the sheet. Listens for as long as the app
 *                            runs, because the layout never unmounts.
 *   the list screen on top   ends its undo window, the same as opening the
 *                            form always did. Listens only while focused.
 *
 * Told straight away, NOT in a microtask like the change counters in
 * db/changes.ts. Those wait so a screen can mark its own write as seen first.
 * Nothing is written here, so there is nothing to wait for.
 */

const listeners = new Set<() => void>();

export const requestAddSheet = (): void => {
  /* A copy, because a listener may unsubscribe while this loop runs. */
  [...listeners].forEach((fn) => fn());
};

/*
 * Subscribe. Returns the unsubscribe function, so it can be returned straight
 * out of an effect as that effect's cleanup.
 */
export const onAddSheetRequested = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
