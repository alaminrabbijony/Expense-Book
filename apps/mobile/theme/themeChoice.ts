import { Appearance } from "react-native";
import { Storage } from "expo-sqlite/kv-store";

/*
 * THE IN-APP LIGHT / DARK SWITCH — its saving and its applying, in one file.
 *
 * Three choices. "system" means follow the phone, which is what the app did
 * before this file existed and is still what a fresh install does.
 *
 * Nothing in the screens changes because of this file. Every screen already
 * reads useColorScheme(), and Appearance.setColorScheme() changes what that
 * hook reports. That is the payoff of choosing React Native's built-ins at
 * Session 34 instead of a theme library.
 *
 * The UI that calls setThemeChoice() is Rabbi's. This file is the data layer.
 */
export type ThemeChoice = "system" | "light" | "dark";

// In the order a segmented control would show them, left to right.
export const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

/*
 * Where the choice lives: expo-sqlite's key-value store (expo-sqlite 16.0.10,
 * already installed — no new package, no rebuild).
 *
 * It writes to its OWN database file, "ExpoSQLiteStorage", not expenses.db.
 * So expenses.db's user_version stays at 8 and no migration exists for this.
 * A setting is not an expense, and it should not ride along with the
 * expense schema's version number.
 */
const KEY = "themeChoice";

/*
 * Anything that is not exactly "light" or "dark" becomes "system". That
 * covers a fresh install (null), and any value a future version might write
 * that this version does not know. The safe answer to "I cannot read the
 * setting" is "do what the phone says", which is what the app always did.
 */
function parse(raw: string | null): ThemeChoice {
  return raw === "light" || raw === "dark" ? raw : "system";
}

/*
 * The choice as this file last applied it. Module-level, because there is
 * exactly one of it for the whole app and the Settings screen needs to know
 * which segment to highlight when it opens.
 */
let current: ThemeChoice = "system";

function apply(choice: ThemeChoice, reason: string) {
  // null, not "system": null is React Native's word for "go back to the
  // phone". It becomes "unspecified" inside, and Android turns that into
  // MODE_NIGHT_FOLLOW_SYSTEM (AppearanceModule.kt 55-63, RN 0.81.5).
  Appearance.setColorScheme(choice === "system" ? null : choice);

  if (__DEV__) {
    /*
     * The THIRD value on this line is the Android trap, printed on purpose.
     *
     * On Android, setColorScheme() does not change anything straight away.
     * It QUEUES the change to run on the UI thread (the native thread that
     * draws the screen). But the JavaScript side reads the scheme back
     * IMMEDIATELY to cache it (Appearance.js, setColorScheme), and that read
     * runs before the queued change. So it caches the OLD scheme.
     *
     * The cache is corrected a moment later, when Android finishes the change
     * and sends React Native an "appearanceChanged" event. That event is also
     * the only thing that makes useColorScheme() re-render; setColorScheme()
     * itself tells no listener at all.
     *
     * Expect "reads back" to show the old scheme on Android. If the screen
     * still repaints, the event arrived and the trap cost nothing. If the
     * screen does NOT repaint, the event never came, and that is the bug.
     */
    console.log(
      `theme: ${reason} → ${choice}, ` +
        `setColorScheme(${choice === "system" ? "null" : `"${choice}"`}), ` +
        `reads back "${Appearance.getColorScheme()}" straight after`,
    );
  }
}

/*
 * Called ONCE, at module load in app/_layout.tsx, before RootLayout renders.
 *
 * getItemSync, not getItemAsync. A Promise would resolve after the first
 * render, so every launch would draw at least one frame in the phone's
 * scheme and then flip. Synchronous at least STARTS the change before
 * anything draws. Whether the first frame is already right is a different
 * question, because of the Android queue above — the dev line in
 * ThemedStatusBar answers it.
 *
 * A failed read falls back to "system" instead of throwing. This runs at
 * launch, and an app that will not open because a setting is unreadable is
 * far worse than an app in the phone's colours.
 */
export function applySavedThemeChoice(): void {
  const t0 = Date.now();
  let raw: string | null = null;
  try {
    raw = Storage.getItemSync(KEY);
  } catch (e: unknown) {
    if (__DEV__) console.warn("theme: could not read the saved choice", e);
  }
  const ms = Date.now() - t0;
  current = parse(raw);
  apply(current, `launch, saved ${raw === null ? "nothing" : `"${raw}"`}, read in ${ms}ms`);
}

/* What the Settings screen highlights when it opens. */
export function getThemeChoice(): ThemeChoice {
  return current;
}

/*
 * What a tap on a segment calls.
 *
 * SAVE FIRST, APPLY SECOND. If the save throws, nothing is applied: the
 * screen keeps showing the old choice, and the app is not left in a scheme
 * that the next launch would quietly undo. This throws to the caller on
 * purpose — the same order as renameCategory before setCategoryIcon at
 * Session 32: the write that can fail goes first.
 *
 * Picking the choice that is already current does nothing at all: no write,
 * no setColorScheme, no log line.
 */
export function setThemeChoice(choice: ThemeChoice): void {
  if (choice === current) return;
  Storage.setItemSync(KEY, choice);
  current = choice;
  apply(choice, "picked");
}