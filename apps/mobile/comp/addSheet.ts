/*
 * The one add sheet, the two buttons that open it, and the title it starts
 * with.
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

/*
 * The title a new expense should start with.
 *
 * The tab bar's + is drawn by the navigator and knows nothing about the page
 * underneath it. So the page in front says what it is showing, and the layout
 * asks here the moment a + is pressed.
 *
 * The PAGE answers, not the route. A title page reads its title once, at
 * mount, and keeps it even if that expense is later renamed or deleted.
 * Working it out again from the route's id would read the database a second
 * time, and could give an answer the page is not showing.
 *
 * An object, not the string. A title page survives a tab switch, so Home's
 * stack and All's stack can each hold one, and both can show the same title.
 * Compared as strings, the page that blurs would clear the registration of
 * the page that just focused: in a model that opened the + blank. Identity
 * cannot confuse two holds, whichever way round blur and focus happen to run.
 */
let held: { readonly title: string } | null = null;

export const holdAddSheetTitle = (title: string): (() => void) => {
  const mine = { title };
  held = mine;
  if (__DEV__) console.log(`add sheet title held: ${title}`);
  return () => {
    /* Only the hold that is still current may clear it. */
    if (held !== mine) return;
    held = null;
    if (__DEV__) console.log(`add sheet title released: ${title}`);
  };
};

/* What a + should put in the title field, or null for an empty form. */
export const addSheetTitle = (): string | null => held?.title ?? null;