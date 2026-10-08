import BottomSheet from "@/comp/BottomSheet";
import CategorySheet, { type CategoryChoice } from "@/comp/CategorySheet";
import ExpenseForm from "@/comp/ExpenseForm";
import { onAddSheetRequested, requestAddSheet } from "@/comp/addSheet";
import { expenseVersion, onExpensesChanged } from "@/db/changes";
import {
  deleteExpense,
  listExpensePage,
  listExpensePageInRange,
  listTitlePage,
  monthRangeAt,
  readCategories,
  readCategoryIcons,
  readExpenseForEdit,
  readTitleTotals,
  readTotals,
  readTotalsInRange,
  restoreExpense,
  updateExpense,
  yearRangeAt,
} from "@/db/expenses";
import type {
  CategoryIcons,
  DateRange,
  DeletedExpense,
  Expense,
  ExpenseForEdit,
} from "@/db/expenses";
/* DEV TOOLS — commented out together with the dev row near the bottom of
   this file. To bring them back, delete this line and the closing line
   below the import, then do the same at the dev row.
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
*/
import { asMinor, DEFAULT_CURRENCY, formatMoney, type Minor } from "@et/shared";
import { getCalendars } from "expo-localization";
import { router, useFocusEffect } from "expo-router";
import {
  memo,
  Profiler,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  AppState,
  BackHandler,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  SlideOutLeft,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

/* ─── Dates ──────────────────────────────────────────────────────────────
 *
 * created_at is a moment, stored as milliseconds since 1970 in UTC. The same
 * number means the same instant everywhere, and it never changes.
 *
 * What changes is how it is SHOWN. Date's get* methods (getHours, getDate,
 * getDay…) read the phone's own time zone, so the same row says 11:19 PM on a
 * phone set to Dhaka and 5:19 PM on one set to London. No permission is
 * needed for that — the time zone belongs to the system clock, not to
 * location.
 *
 * Built by hand rather than with Intl or toLocaleString, so the output is
 * the same on every phone and nothing depends on what Hermes' Intl supports.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* Full names, for the month on the top card. MONTHS above stays short for
 * the date line on each card. */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/*
 * Midnight at the start of the local day that `ms` falls in.
 *
 * new Date(year, month, day) builds a LOCAL midnight. Subtracting
 * 24 * 60 * 60 * 1000 from a timestamp instead would be wrong on the days a
 * clock change makes shorter or longer than 24 hours.
 *
 * Exported, with readClockSettings and formatWhen below, for the title
 * page: its rows show the same date line as these.
 */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/* The local midnight `days` days after the one given. Negative goes back.
 * The Date constructor rolls day 0 or day 32 into the right month by
 * itself, so month ends need no special case. */
function shiftLocalDay(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

/*
 * The phone's clock settings, read fresh from the system.
 *
 *   clock24   the 12/24-hour switch in the phone's Settings. JavaScript's Date
 *             cannot see it, and Intl's hourCycle gives the language's usual
 *             format rather than the switch, so this comes from native code
 *             (expo-localization). On Android it is
 *             DateFormat.is24HourFormat; on iOS, the system's time format.
 *   zone      the time zone name as the NATIVE side sees it, e.g.
 *             "Asia/Dhaka". Only used by the dev log, next to Hermes' own
 *             getTimezoneOffset. If the two ever disagree, Hermes is the one
 *             still on the old zone.
 *
 * Both are read on every call. Nothing here is cached, so a change made in
 * Settings shows up the next time this runs — which is why it runs when the
 * app comes back to the front.
 *
 * The type allows null for uses24hourClock. Only the web build returns it;
 * treating it as false means "12-hour", the format the app had before.
 */
export function readClockSettings(): {
  clock24: boolean;
  zone: string | null;
} {
  const cal = getCalendars()[0];
  return {
    clock24: cal?.uses24hourClock ?? false,
    zone: cal?.timeZone ?? null,
  };
}

/*
 *   clock24 false   9:05 PM, 12:30 AM   noon and midnight are 12, not 0
 *   clock24 true    21:05, 00:30        hour padded to two digits, the way
 *                                       Android's own 24-hour clock shows it
 */
function formatClock(d: Date, clock24: boolean): string {
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (clock24) return `${String(h).padStart(2, "0")}:${mm}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}

/*
 * The date line under an expense.
 *
 *   Today, 9:14 PM            same calendar day as todayStart
 *   Yesterday, 11:50 PM       the calendar day before — NOT "within 24
 *                             hours". Ten minutes after midnight, an expense
 *                             from 11:50 PM is already yesterday's.
 *   Sat 26 Sep, 2:59 AM       any other day this year
 *   12 Mar 2025, 2:00 PM      another year
 *
 * todayStart and clock24 are passed in rather than read here. The rows are
 * memo'd, so a row only re-renders when a prop changes. Reading the clock or
 * the 24-hour setting inside would give a label that is never recomputed when
 * either one changes. See todayStart and clock24 in Index.
 */
export function formatWhen(
  createdAt: number,
  todayStart: number,
  clock24: boolean,
): string {
  const d = new Date(createdAt);
  const day = startOfLocalDay(createdAt);
  const clock = formatClock(d, clock24);

  if (day === todayStart) return `Today, ${clock}`;
  if (day === shiftLocalDay(todayStart, -1)) return `Yesterday, ${clock}`;

  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(todayStart).getFullYear()
    ? `${WEEKDAYS[d.getDay()]} ${date}, ${clock}`
    : `${date} ${d.getFullYear()}, ${clock}`;
}

/*
 * The month a range starts in, by name: "October". Read from `start`, so it
 * names the month the rows and the total were read for.
 *
 * The `?? ""` only satisfies the type checker: getMonth() is always 0 to 11.
 */
function monthName(range: DateRange): string {
  return MONTH_NAMES[new Date(range.start).getMonth()] ?? "";
}

/* "October 2026", for the top card. */
function formatMonth(range: DateRange): string {
  return `${monthName(range)} ${new Date(range.start).getFullYear()}`;
}

/*
 * What the empty list says. An empty month, an empty app and an empty
 * filter each need different help:
 *
 *   month, no filter     Nothing spent in October yet / Tap + to add one.
 *   month and a filter   No Food expenses this month / Nothing's been filed
 *                        here yet.
 *   no month, no filter  No expenses yet / Tap + to add your first one.
 *   no month, a filter   No expenses in Food / Nothing's been filed here yet.
 *
 * A filter also gets Show all, drawn where this is used. YOURS TO REWORD.
 */
function emptyText(
  filter: CategoryChoice,
  month: DateRange | null,
): { title: string; body: string } {
  if (filter) {
    return {
      title: month
        ? `No ${filter.name} expenses this month`
        : `No expenses in ${filter.name}`,
      body: "Nothing's been filed here yet.",
    };
  }
  return month
    ? {
        title: `Nothing spent in ${monthName(month)} yet`,
        body: "Tap + to add one.",
      }
    : { title: "No expenses yet", body: "Tap + to add your first one." };
}

/* ─── Periods: the title page's ⋯ menu ──────────────────────────────────── */

/*
 * The stretch of time a list covers. Home is always "month". All has none:
 * it shows every expense. The title page starts at "month", and its ⋯ menu
 * switches between all three.
 */
type Period = "month" | "year" | "all";

/* The menu's rows, in order. YOURS TO REWORD. */
const PERIODS: { key: Period; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

/*
 * The range a period covers at the moment `at`, in the phone's own time.
 * null for all time, and for a list with no period at all (All).
 */
function rangeOf(period: Period | null, at: number): DateRange | null {
  if (period === "month") return monthRangeAt(at);
  if (period === "year") return yearRangeAt(at);
  return null;
}

/*
 * The period line on the title page's card: "October 2026", "2026" or
 * "All time". Read from the range, so it names the stretch of time the rows
 * and the total were read for.
 */
function formatPeriod(period: Period | null, range: DateRange | null): string {
  if (period === "month" && range) return formatMonth(range);
  if (period === "year" && range) {
    return String(new Date(range.start).getFullYear());
  }
  return "All time";
}

/* The label under it. YOURS TO REWORD. */
function periodLabel(period: Period | null): string {
  if (period === "month") return "Spent this month";
  if (period === "year") return "Spent this year";
  return "Spent in total";
}

/*
 * Whether two titles are the same title, the way the title queries compare
 * them: COLLATE NOCASE, which folds the 26 letters A-Z and nothing else.
 *
 * NOT toLowerCase(). That folds every alphabet, so "Çay" and "çay" would be
 * the same here and different in SQLite. An edit from one to the other
 * would then keep a row on screen that the page's own query no longer finds.
 */
function sameTitle(a: string, b: string): boolean {
  const fold = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  return fold(a) === fold(b);
}

/*
 * What the title page's empty list says. An empty month or year also gets
 * Show all time, drawn where this is used, the way an empty filter on Home
 * gets Show all. An empty all time gets nothing: there is nowhere wider to
 * go. YOURS TO REWORD.
 *
 *   this month   No Tea expenses this month / Nothing yet this month.
 *   this year    No Tea expenses this year / Nothing yet this year.
 *   all time     No Tea expenses left / Every one was deleted or renamed.
 */
function titleEmptyText(
  title: string,
  period: Period | null,
): { title: string; body: string } {
  if (period === "month") {
    return {
      title: `No ${title} expenses this month`,
      body: "Nothing yet this month.",
    };
  }
  if (period === "year") {
    return {
      title: `No ${title} expenses this year`,
      body: "Nothing yet this year.",
    };
  }
  return {
    title: `No ${title} expenses left`,
    body: "Every one was deleted or renamed.",
  };
}

/*
 * The icon a card falls back to: a category with no icon chosen, and the
 * Uncategorised row, which is meant to look unsorted.
 */
const DEFAULT_CATEGORY_ICON = "receipt-outline" as const;

/*
 * The icon font's own list of names, read once at module load.
 *
 * An icon name used to be written in this file, so a typo was a type error.
 * It comes out of the database now, as plain text, and TypeScript cannot see
 * inside a database. An unknown name does not throw either: the font draws a
 * literal "?" on the card and logs nothing.
 *
 * getRawGlyphMap is the typed way to ask the font what it has. The font also
 * has a hasIcon() function, but it is missing from the published typings, so
 * it does not compile.
 */
const IONICON_NAMES = Ionicons.getRawGlyphMap();
type IoniconName = keyof typeof IONICON_NAMES;

const iconOrDefault = (name: string | undefined): IoniconName =>
  name && Object.prototype.hasOwnProperty.call(IONICON_NAMES, name)
    ? (name as IoniconName)
    : DEFAULT_CATEGORY_ICON;

/*
 * A one-line signature of the icon map. It does two jobs: deciding whether a
 * re-read actually changed anything, and telling the list that it did.
 *
 * Both come from the same object, so they cannot disagree — the same shape as
 * holdPeriod writing its four values together. Sorted, so the order rows come
 * back in cannot change the signature by itself.
 */
const iconsSignature = (icons: CategoryIcons): string =>
  Object.keys(icons)
    .sort()
    .map((id) => `${id}:${icons[id]}`)
    .join(",");

/*
 * Twelve colours for the category icons.
 *
 * `color` is the glyph. `tint` is the circle behind it: the same colour at 22%
 * over the card's #1C1C1E, worked out in advance so no blending happens while
 * a row draws.
 *
 * Every pair was checked against the surface it sits on and the weakest reads
 * 3.54. iOS's indigo #5E5CE6 is NOT in here: it read 2.75, under the 3.0 floor
 * for a glyph this size, and #7D7AFF replaces it at 4.05.
 */
const ICON_COLORS: { color: string; tint: string }[] = [
  { color: "#FF453A", tint: "#4E2524" },
  { color: "#FF9F0A", tint: "#4E391A" },
  { color: "#FFD60A", tint: "#4E451A" },
  { color: "#30D158", tint: "#20442B" },
  { color: "#66D4CF", tint: "#2C4445" },
  { color: "#40C8E0", tint: "#244249" },
  { color: "#64D2FF", tint: "#2C4450" },
  { color: "#0A84FF", tint: "#183350" },
  { color: "#7D7AFF", tint: "#313150" },
  { color: "#BF5AF2", tint: "#402A4D" },
  { color: "#FF375F", tint: "#4E222C" },
  { color: "#AC8E68", tint: "#3C352E" },
];

/*
 * What a category with no icon shows: the grey circle and near-white glyph the
 * cards had before any of this. Kept separate on purpose. "Nobody has chosen
 * an icon yet" should not look like a choice someone made.
 */
const PLACEHOLDER_SHADE = { color: "#ECEDEE", tint: "#2C2C2E" };

/*
 * Which colour a category gets.
 *
 * Worked out from its id rather than stored, so nothing needs a column or a
 * migration and every category has one from the moment it exists, hand-made
 * ones included. The same id always lands on the same colour, so a colour
 * never moves by itself. The five categories that have icons today land on
 * five different colours.
 *
 * Once a picker exists to choose a colour, a stored one simply overrides this.
 */
const shadeForCategory = (id: string): { color: string; tint: string } => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ICON_COLORS[Math.abs(h) % ICON_COLORS.length];
};

/*
 * Everything one card needs to draw its icon: the glyph name, its colour, and
 * the circle behind it.
 *
 * The colour follows whether an icon was SET, not whether the font knew the
 * name. A category whose icon the font cannot draw still gets its colour; a
 * category with no icon at all stays grey.
 */
const iconForRow = (
  categoryId: string | null,
  icons: CategoryIcons,
): { name: IoniconName; color: string; tint: string } => {
  const chosen = categoryId ? icons[categoryId] : undefined;
  const shade =
    chosen && categoryId ? shadeForCategory(categoryId) : PLACEHOLDER_SHADE;
  return { name: iconOrDefault(chosen), color: shade.color, tint: shade.tint };
};

/*
 * When the current row animation started, for the dev logs below. null when
 * no row animation is in flight.
 *
 * A plain module variable is enough: only one row animates at a time.
 * deleteRow and undoDelete set it; logRowAnimation clears it.
 */
let rowAnimStartedAt: number | null = null;

/*
 * Which copy of this screen started that animation, for the same logs.
 *
 * Three places render this screen — Home, All and the title page — and the
 * module variables above are shared by every copy. Only one row animates at
 * a time anywhere in the app, so one name is enough. deleteRow and
 * undoDelete set it next to rowAnimStartedAt.
 */
type ScreenName = "home" | "all" | "title";
let rowAnimScreen: ScreenName = "home";

/*
 * Dev log: how many copies of each screen have been built since the app
 * started. A copy takes the next number when it is built and keeps it until
 * it is thrown away.
 *
 * The number tells apart three things that otherwise print the same lines:
 *
 *   a rebuild     "[all] copy 1 unmounted", later "[all] copy 2 mounted"
 *   a second      "[all] copy 2 mounted" with no "copy 1 unmounted" before
 *   copy          it: two copies of All alive at the same time
 *   a hot update  "copy 1 unmounted", then "copy 1 mounted" again. Same
 *                 number, because a hot update keeps state and only re-runs
 *                 the effects
 */
const copiesBuilt: Record<ScreenName, number> = { home: 0, all: 0, title: 0 };

/*
 * Dev log: how long after the tap one step of a row animation happened.
 *
 * Three steps are logged, so one slow number can be split into its parts:
 * React finishing the first render, React finishing the render that changes
 * `rows`, and the animation's finish callback arriving back on this thread.
 *
 * Prints nothing when no row animation is in flight. If a finish callback
 * never arrives, this stays switched on, and every later `rows` change prints
 * a step line. That is on purpose: it is the sign the animation never ran.
 */
function logRowStep(step: string) {
  if (!__DEV__ || rowAnimStartedAt === null) return;
  console.log(
    `[${rowAnimScreen}] row ${step} after ${Date.now() - rowAnimStartedAt}ms`,
  );
}

/*
 * Dev log for the <Profiler> around the list: one line per list update,
 * printed only while a row animation is in flight, like logRowStep.
 *
 * Two numbers per line:
 *
 *   rendering   the time React spent calling the components inside the
 *               list for this one update. Every row that renders again
 *               adds to it.
 *   committed   how long after the tap this update had been fully applied,
 *               including every view inside the list finishing its own
 *               update work.
 *
 * Time that passes between two lines and is not in `rendering` was spent
 * somewhere other than React calling the list's components.
 *
 * Each line starts with the copy's name — [home] or [all] — which arrives
 * here as the Profiler's `id`.
 *
 * Each line also says how many ExpenseRows ran in that update, split in two:
 *
 *   mounted       rows that appeared for the first time. memo cannot skip
 *                 these — a new row always has to render once.
 *   re-rendered   rows that already existed and ran again. With memo
 *                 working, only a row whose props really changed does this.
 *
 * The split matters because the two have different causes. Many re-renders
 * mean a prop is a new object each time. Many mounts mean rows are being
 * thrown away and built again.
 *
 * THE COUNTERS ARE RESET ON EVERY COMMIT, EVEN WHEN NOTHING IS PRINTED.
 * Most commits happen while no row animation is in flight, so this prints
 * nothing for them. If the reset only happened on a printed line, every
 * silent commit's rows would pile up into the next printed number. The app's
 * first mount alone would add ~50 to it.
 *
 * Only a development build calls this. React's production renderer never
 * calls onRender, so in a release build the Profiler just renders the list.
 */
let rowsMounted = 0;
let rowsReRendered = 0;

function logListRender(
  id: string,
  phase: "mount" | "update" | "nested-update",
  actualDuration: number,
) {
  const mounted = rowsMounted;
  const reRendered = rowsReRendered;
  rowsMounted = 0;
  rowsReRendered = 0;

  if (!__DEV__ || rowAnimStartedAt === null) return;
  console.log(
    `[${id}] list ${phase}: ${Math.round(actualDuration)}ms rendering, ` +
      `rows ${mounted} mounted / ${reRendered} re-rendered, ` +
      `committed after ${Date.now() - rowAnimStartedAt}ms`,
  );
}

/*
 * Dev log for the row animations, called when one finishes.
 *
 * The finish callback runs on the UI thread, inside a worklet. A worklet
 * gets a COPY of the variables it closes over, taken when it was created —
 * and the animations below are created once, at module load, when
 * rowAnimStartedAt is still null. So the elapsed time has to be worked out
 * here, back on the JS thread, where the variable is live. scheduleOnRN is
 * what carries the call across.
 *
 * The elapsed time tells two states apart. An animation that really ran
 * cannot finish sooner than its duration. One that was skipped by the
 * system's reduce-motion setting finishes on its first frame.
 */
function logRowAnimation(kind: "out" | "in", finished: boolean) {
  logRowStep(`${kind} finished: ${finished}`);
  rowAnimStartedAt = null;
}

/*
 * The two row animations. YOURS TO RESTYLE: the preset and the duration.
 *
 * Built once, here, and never inside the row. Reanimated only re-sends an
 * animation to the UI thread when the prop is a different object from last
 * render. One builder per render would be a new object every time, so every
 * row would re-send its config on every redraw of the list.
 *
 * The "worklet" line is written out rather than left to the Babel plugin.
 * The plugin only spots a callback chained directly onto a preset name, and
 * moving this line around would silently stop it from being a worklet.
 */
const ROW_OUT = SlideOutLeft.duration(200).withCallback((finished) => {
  "worklet";
  scheduleOnRN(logRowAnimation, "out", finished);
});

const ROW_IN = FadeIn.duration(250).withCallback((finished) => {
  "worklet";
  scheduleOnRN(logRowAnimation, "in", finished);
});

/*
 * The undo row's fade in and out, and the list's slide down and up to make
 * room for it. YOURS TO RESTYLE: the presets and the durations.
 *
 * Built once, here, for the same reason as ROW_OUT: a new builder object on
 * every render would be re-sent to the UI thread every time.
 *
 * The undo row has `exiting` from its very first render, so it needs none of
 * the one-render-early trick the expense rows need. It is mounted and
 * unmounted by `held` alone.
 *
 * LIST_MOVE is a LAYOUT transition, not an entering or exiting one. It runs
 * whenever the view it sits on changes position or size. The undo row
 * appearing above the list pushes the list down; with this, the list slides
 * there instead of jumping.
 */
const UNDO_IN = FadeIn.duration(200);
const UNDO_OUT = FadeOut.duration(200);
const LIST_MOVE = LinearTransition.duration(200);

/*
 * Which edges the SafeAreaView pads. NOT THE BOTTOM.
 *
 * SafeAreaView pads by the insets of the nearest SafeAreaProvider, not by
 * where the SafeAreaView itself sits (react-native-safe-area-context 5.6.2,
 * SafeAreaView.kt: getSafeAreaInsets(providerView)). Inside the tabs, the
 * nearest provider is expo-router's root one, which covers the whole window:
 * the tab navigator does not add its own when one already exists
 * (@react-navigation/elements, SafeAreaProviderCompat.tsx). So the bottom
 * inset — the system navigation bar — would be padded here too, while the
 * tab bar below this screen already pads for it. The result would be an
 * empty strip between the list and the tab bar.
 *
 * Built once, here, for the same reason as ROW_OUT: one object for the life
 * of the app, not a new array on every render.
 *
 * The navigator's own header is switched off for every tab in the tab
 * layout (app/(tabs)/_layout.tsx), so this screen no longer sets it.
 */
const SAFE_EDGES = ["top", "left", "right"] as const;

/*
 * The title page pads ALL FOUR edges. It opens over the tabs, so there is
 * no tab bar under it, and the bottom inset — the system navigation bar —
 * is its own to pad. With SAFE_EDGES, the last row of a long list would sit
 * under the navigation bar.
 */
const SAFE_EDGES_ALL = ["top", "left", "right", "bottom"] as const;

/*
 * Tap feedback. Android shows a ripple; iOS has no ripple, so it dims
 * instead. Only one of the two ever runs on a platform — both on Android
 * would be double feedback.
 *
 * android_ripple is ignored on iOS, and the pressed opacity is switched off
 * on Android below, so each control can simply be given both.
 */
const RIPPLE = { color: "rgba(255,255,255,0.22)" };
const RIPPLE_ROUND = { ...RIPPLE, borderless: true, radius: 24 };

/*
 * The same feedback for controls that sit ON a white card. A white ripple
 * on a white card is invisible, so the tap would look like it did nothing.
 * The rule: pick the ripple by the colour of what is directly behind the
 * control, not by what the control is.
 */
const RIPPLE_ON_LIGHT = { color: "rgba(0,0,0,0.12)" };

/*
 * Text and icons on the white top card. YOURS TO RESTYLE. Icons take their
 * colour as a prop rather than from a style, so the icon calls read it from
 * here.
 */
const INK = "#1C1C1E";
const iosPressed = (pressed: boolean) =>
  Platform.OS === "ios" && pressed ? styles.iosPressed : null;

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
 *
 * WHY memo. FlatList hands every cell a brand-new renderItem wrapper each
 * time it renders, and this screen makes it render on every one of its own
 * renders. So every cell calls renderItem again. memo is what lets this row
 * stop there: React compares each prop with the previous one (Object.is),
 * and if all nine are the same, the row, its swipeable and its texts are
 * not rendered again.
 *
 * That only works while every prop really is the same between renders:
 *
 *   expense     the same object, as long as nothing replaced this row.
 *               saveEdit's map, the delete filter, insertInSortOrder and
 *               loadMore all keep the untouched rows' objects.
 *   leaving,
 *   restoring   booleans, so only the one row whose value flips renders.
 *               This is also how the leaving row still gets `exiting`.
 *   onEdit,
 *   onDelete,
 *   onWillOpen,
 *   onOpen      must keep their identity. They are useCallback in the
 *               screen below. Pass a function written inline instead, and
 *               it is a new function every render — every row renders
 *               again, nothing breaks, and the list is just slow again.
 *               onOpen is null on the title page, where a tap does
 *               nothing: null is the same value on every render too.
 *   todayStart  a plain number that changes once a day, at local midnight.
 *               When it does, every row renders once so "Today" can become
 *               "Yesterday". A Date object here instead would be a new
 *               object every render, and memo would never skip a row.
 *   clock24     a plain boolean, the same idea as todayStart. It changes only
 *               when the 24-hour switch in Settings is flipped, and then every
 *               row renders once to redraw its time.
 */
const ExpenseRow = memo(function ExpenseRow({
  expense,
  iconName,
  iconColor,
  iconTint,
  leaving,
  restoring,
  todayStart,
  clock24,
  onEdit,
  onDelete,
  onWillOpen,
  onOpen,
}: {
  expense: Expense;
  /* Already checked against the font by the caller, so this component never
   * has to think about a name the font does not have. A plain string, like
   * todayStart and clock24, so memo can compare it with Object.is. */
  iconName: IoniconName;
  /* Two plain strings rather than one object. memo compares with Object.is, so
   * an object built in the parent would be a new value on every render and the
   * row would never skip one. */
  iconColor: string;
  iconTint: string;
  leaving: boolean;
  restoring: boolean;
  todayStart: number;
  clock24: boolean;
  onEdit: (e: Expense, methods: SwipeableMethods | null) => void;
  onDelete: (e: Expense) => void;
  onWillOpen: (methods: SwipeableMethods | null) => void;
  onOpen: ((e: Expense) => void) | null;
}) {
  const swipeRef = useRef<SwipeableMethods | null>(null);

  /*
   * Dev-only render count for logListRender.
   *
   * This body only runs when memo lets the row through, so counting here
   * counts real renders. `seen` tells a first render from a later one: a ref
   * keeps its value for as long as this row stays mounted, and starts false
   * again for a row that is new.
   *
   * React's docs say not to read a ref during render, except to set it up
   * once. This bends that on purpose: the result only feeds a log line and
   * never changes what the row draws.
   */
  const seen = useRef(false);
  if (__DEV__) {
    if (!seen.current) {
      rowsMounted += 1;
      seen.current = true;
    } else {
      rowsReRendered += 1;
    }
  }

  /* What the card shows. Written once, and put inside a Pressable or a
   * plain View below, depending on whether a tap does anything. */
  const cardBody = (
    <>
      <View style={[styles.iconCircle, { backgroundColor: iconTint }]}>
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {expense.title}
        </Text>
        <Text style={styles.rowWhen}>
          {formatWhen(expense.createdAt, todayStart, clock24)}
        </Text>
      </View>
      <Text style={styles.rowAmount}>
        {formatMoney(expense.amountMinor, expense.currencyCode)}
      </Text>
    </>
  );

  return (
    /*
     * Both animations are switched on for ONE row only, never for all of
     * them. A row with `exiting` animates out whenever it unmounts, for any
     * reason — a filter change, a reload, or the list recycling rows that
     * scrolled far off screen. Only a delete should look like a delete.
     *
     * `entering` is read once, when the row mounts. `exiting` is read when
     * the row renders, and it must already be set one render BEFORE the row
     * is removed. See leavingId in Index for why.
     */
    <Animated.View
      entering={restoring ? ROW_IN : undefined}
      exiting={leaving ? ROW_OUT : undefined}
      // The gap between cards lives OUTSIDE the swipeable. Inside it, the
      // swipe buttons would be the card's height plus the gap.
      style={styles.rowGap}
    >
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
            {/* The icons carry no words, so a screen reader needs the label
                to say what each block does. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit expense"
              android_ripple={RIPPLE}
              style={({ pressed }) => [
                styles.rowAction,
                styles.rowActionEdit,
                iosPressed(pressed),
              ]}
              // The handle is handed UP to the parent rather than used here.
              // Closing on Save happens inside saveEdit, which runs long after
              // this onPress has finished, so the parent is the only place that
              // can still reach this row by then.
              onPress={() => onEdit(expense, swipeRef.current)}
            >
              <Ionicons name="pencil" size={22} color="#FFFFFF" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete expense"
              android_ripple={RIPPLE}
              style={({ pressed }) => [
                styles.rowAction,
                styles.rowActionDelete,
                iosPressed(pressed),
              ]}
              // No handle passed up. This row is about to be removed, so
              // nothing will ever need to close it.
              onPress={() => onDelete(expense)}
            >
              <Ionicons name="trash" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        )}
      >
        {/* The card's backgroundColor is MECHANISM as well as looks: it
            must stay opaque, or the buttons behind would show through the
            title and the amount during the slide.

            A tap on the card opens this title's page. Two cases where a
            touch on the card must NOT open it, both handled by the
            swipeable (gesture-handler 2.28.0), not here:

              the row is open    the view around the card is
                                 pointerEvents "box-only" while the row is
                                 open (ReanimatedSwipeable.tsx line 556), so
                                 the card gets no touch at all. The tap goes
                                 to the swipeable, which closes the row.
              a swipe            when the swipe takes over, gesture-handler
                                 cancels React Native's own handling of
                                 that finger (GestureHandlerOrchestrator.kt,
                                 makeActive; on Android the cancel reaches
                                 React Native through
                                 RNGestureHandlerRootHelper.kt, onCancel).
                                 A cancelled press never calls onPress.

            On the title page onOpen is null and the card is a plain View:
            every card there is the same title, so a tap has nowhere to go,
            and a card that ripples would promise something. */}
        {onOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${expense.title}`}
            android_ripple={RIPPLE}
            style={({ pressed }) => [styles.card, iosPressed(pressed)]}
            onPress={() => onOpen(expense)}
          >
            {cardBody}
          </Pressable>
        ) : (
          <View style={styles.card}>{cardBody}</View>
        )}
      </ReanimatedSwipeable>
    </Animated.View>
  );
});

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

/*
 * The two reads every fresh read of the list makes: one page, and the
 * header's count and money.
 *
 * `title` set means the title page: that title's rows, in `range` or in
 * all time. It never has a category filter.
 *
 * Otherwise, `range` null means every expense, through the all-time queries
 * whose recorded timings must not change. A range means the range queries.
 *
 * Module functions that take the range and the title as arguments, so no
 * closure can hold on to an old period. Callers pass rangeRef.current at
 * the moment of the call.
 */
function readPage(
  range: DateRange | null,
  offset: number,
  categoryId?: string,
  title?: string,
): Expense[] {
  if (title !== undefined) return listTitlePage(title, offset, range);
  return range
    ? listExpensePageInRange(offset, range, categoryId)
    : listExpensePage(offset, categoryId);
}

function readHeaderTotals(
  range: DateRange | null,
  categoryId?: string,
  title?: string,
) {
  if (title !== undefined) return readTitleTotals(title, range);
  return range ? readTotalsInRange(range, categoryId) : readTotals(categoryId);
}

/*
 * Three places render this screen, each a SEPARATE COPY with its own rows,
 * total, offset and undo window — which is why a write in one has to reach
 * the others:
 *
 *   Home         the top card, this month only, a category filter on ⋯
 *   All          no card, every expense
 *   the title    the top card for one title, a period menu on ⋯, opened
 *   page         over the tabs by tapping a card on Home or All
 *
 * `screen` names the copy at the start of every dev log line: [home],
 * [all] or [title]. The copies share most of their lines, and a line that
 * cannot be traced to a copy proves nothing.
 *
 * `showTopCard` draws the card. Without it there is no total, no ⋯ and no
 * filter, so `filter` stays null on All expenses.
 *
 * `monthOnly` and `titleOnly` are the differences in what is read. Home
 * passes monthOnly: its list, its total and its ⋯ sheet cover this month.
 * The title page passes titleOnly, the title it shows: its list and total
 * cover that title, in the period its ⋯ menu picks, this month to start.
 * A prop never changes for a copy, so every function below can read them.
 */
export default function ExpenseListScreen({
  screen,
  showTopCard,
  monthOnly = false,
  titleOnly,
}: {
  screen: ScreenName;
  showTopCard: boolean;
  monthOnly?: boolean;
  titleOnly?: string;
}) {
  /*
   * This copy's number, for the dev log above.
   *
   * Taken in a useState initialiser, which runs once per copy: a hot update
   * keeps it, a rebuild gets a new one. Written as useState(n) instead, the
   * ++ would run on every render and the numbers would jump.
   */
  const [copy] = useState(() => ++copiesBuilt[screen]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log(`[${screen}] copy ${copy} mounted`);
    return () => console.log(`[${screen}] copy ${copy} unmounted`);
  }, [screen, copy]);

  // How many rows we have already pulled out of the database.
  // A REF, not state — onEndReached can fire twice before React
  // redraws, and state would still be showing the old number.
  const offsetRef = useRef(0);

  /*
   * The expense version this copy's rows were read at.
   *
   * db/changes.ts adds 1 to the expense version after every expense write,
   * anywhere in the app. When this number is behind that one, the rows on
   * this screen are older than the database.
   *
   * Set in exactly two kinds of place:
   *
   *   a fresh read    the first page below, applyFilter and reload. The rows
   *                   now match the database, whatever the version is.
   *   this copy's     deleteRow, undoDelete and saveEdit. Each one patches
   *   own write       the screen by hand straight after its write, so the
   *                   new version is already shown. Marking it seen inside
   *                   the handler is what makes the listener below find
   *                   nothing to do — the listener is only told in a
   *                   microtask, after the handler has returned.
   *
   * A ref, not state: nothing on screen draws it, and the listener and the
   * focus check must read the current value, not the one from the render that
   * created them.
   */
  const seenRef = useRef(0);

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

  /*
   * The period this copy shows, and the stretch of time it covers.
   *
   *   period   "month" on Home, always. null on All, which has no period.
   *            On the title page "month" to start, then whatever its ⋯
   *            menu picks: "month", "year" or "all".
   *   range    the two instants the period covers right now: this month's
   *            or this year's local midnights. null for all time, and on
   *            All.
   *
   * Held twice on purpose, like heldRef and held further down:
   *
   *   periodRef, rangeRef  what every read uses: the first page,
   *            applyFilter, reload and loadMore. They have to be refs,
   *            because applyFilter is also called by the change listener,
   *            which is made ONCE, at the first render. A range taken from
   *            render scope would be the first render's range forever: after
   *            the 1st, an add would re-read last month, and the new expense
   *            would never show.
   *   period, range  state, so the top card redraws when either changes. It
   *            draws the period line and hands the range to the ⋯ sheet.
   *
   * Set in three places:
   *
   *   the first page   the rows initialiser below writes the two refs, and
   *                    the two state initialisers after it copy them.
   *   the 1st          the period check, through holdPeriod.
   *   the ⋯ menu       applyPeriod, through holdPeriod.
   *
   * holdPeriod writes all four at once, so they cannot drift apart.
   */
  const periodRef = useRef<Period | null>(null);
  const rangeRef = useRef<DateRange | null>(null);

  const [rows, setRows] = useState<Expense[]>(() => {
    /* Worked out in the same step as the page it scopes, so the two can
     * never name different stretches of time. */
    periodRef.current = monthOnly || titleOnly !== undefined ? "month" : null;
    rangeRef.current = rangeOf(periodRef.current, Date.now());
    const t0 = Date.now();
    const first = readPage(rangeRef.current, 0, undefined, titleOnly);
    console.log(
      `[${screen}] first page: ${first.length} rows in ${Date.now() - t0}ms`,
    );
    offsetRef.current = first.length;
    /* Read in the same synchronous step as the page, so no write can land
     * between the two. */
    seenRef.current = expenseVersion();
    return first;
  });

  /* After the rows initialiser, which sets rangeRef: React runs state
   * initialisers in the order they are written. */
  const [totals, setTotals] = useState(() => {
    const t0 = Date.now();
    const first = readHeaderTotals(rangeRef.current, undefined, titleOnly);
    /*
     * Printed on every open, like "first page": opening a page four times
     * gives four readings. The size is in the line because a time means
     * nothing without the number of expenses it was taken over.
     */
    if (__DEV__) {
      console.log(
        `[${screen}] first total: ${first.count} expenses in ${Date.now() - t0}ms`,
      );
    }
    return first;
  });

  const [period, setPeriod] = useState<Period | null>(() => periodRef.current);
  const [range, setRange] = useState<DateRange | null>(() => rangeRef.current);

  /*
   * The category icons, held as the map and its signature together.
   *
   * Read in the initialiser as well as on focus, because an effect runs after
   * the first render — without this, the first frame of a cold start would
   * draw the placeholder on every card and then redraw all of them.
   *
   * On focus is enough to keep it true. A category can change four ways and
   * each one is covered: an icon is only picked on the Categories tab, so this
   * screen was blurred; a category made from the add sheet has no icon yet,
   * and a map that does not know it falls back to the placeholder anyway; a
   * rename does not touch icons; and a delete moves its expenses to
   * Uncategorised, so those rows arrive carrying a different id.
   */
  const [icons, setIcons] = useState<{ map: CategoryIcons; key: string }>(
    () => {
      const map = readCategoryIcons();
      return { map, key: iconsSignature(map) };
    },
  );

  /* useCallback for the same reason as holdCopy: the period check lists it,
   * and it only touches refs and setters, so it never changes. */
  const holdPeriod = useCallback(
    (nextPeriod: Period | null, nextRange: DateRange | null) => {
      periodRef.current = nextPeriod;
      rangeRef.current = nextRange;
      setPeriod(nextPeriod);
      setRange(nextRange);
    },
    [],
  );

  /*
   * Local midnight at the start of today. Every row reads it to decide
   * between "Today", "Yesterday" and a date.
   *
   * THE CLOCK DOES NOT RE-RENDER ANYTHING. Midnight passing changes no prop
   * and no state, and the rows are memo'd, so without this every "Today"
   * label would stay "Today" until something else happened to redraw it.
   * This number is the one thing that changes at midnight, so it is the one
   * thing that makes the rows render again. It changes once a day, and every
   * row renders once when it does.
   */
  const [todayStart, setTodayStart] = useState(() =>
    startOfLocalDay(Date.now()),
  );

  /*
   * The phone's 12/24-hour switch. Every row reads it to format its time.
   *
   * Read in the initialiser, not only in the effect below. The effect runs
   * AFTER the first render, so starting at false would draw every row in
   * 12-hour first, then draw all of them again a moment later on a 24-hour
   * phone.
   *
   * The switch lives in the phone's Settings, outside this app, so the only
   * way it can change is while the app is in the background. That is why
   * refresh below re-reads it when the app comes back.
   */
  const [clock24, setClock24] = useState(
    () => readClockSettings().clock24,
  );

  /*
   * Works todayStart and clock24 out again at two moments:
   *
   *   at local midnight   a timer set for exactly then. Covers the app left
   *                       open on screen across midnight.
   *   when the app comes  AppState's "active". Covers everything the timer
   *   back to the front   cannot see: JS timers do not run while the app is
   *                       in the background, so a phone that slept through
   *                       midnight wakes with the timer still waiting. It
   *                       also covers a change of time zone, of the clock
   *                       itself, or of the 24-hour switch — all made in
   *                       Settings, while this app is in the background.
   *
   * Each run clears the old timer and sets a new one, so there is never more
   * than one. If a timer ever fires a moment early, startOfLocalDay still
   * returns today, the state does not change, and the next timer is set for
   * the few milliseconds left — it corrects itself.
   *
   * Setting the same number again is free: React compares it with Object.is
   * and skips the render. So calling this on every resume costs nothing on
   * the days nothing changed.
   *
   * Only `screen` in the dependency list. Everything else inside is a module
   * function or a setter, and none of them change between renders. A copy's
   * name never changes either, so this still runs once per copy.
   *
   * Each copy runs its own: two tabs mean two timers and two AppState
   * listeners, which is why each line says which copy printed it.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    /* The day this effect last set, for the dev log only. Kept here rather
     * than read from state, because state inside this closure would be the
     * value from the render that created it — the mount — forever. */
    let lastStart: number | null = null;

    const refresh = (reason: string) => {
      if (timer !== null) clearTimeout(timer);

      const now = Date.now();
      const start = startOfLocalDay(now);
      const delay = shiftLocalDay(start, 1) - now;
      const settings = readClockSettings();

      /*
       * Dev log for EVERY check, not only the ones that change the day. A
       * check that finds nothing new would otherwise leave no trace, and
       * "never ran" would look the same as "ran and saw the old clock".
       *
       * Two views of the time zone, side by side:
       *
       *   zone offset   how HERMES sees it, in minutes: -360 for Dhaka, -60
       *                 for London in summer. This is what every Date getter
       *                 in this file uses.
       *   zone          how the NATIVE side sees it, by name.
       *
       * If the name says Europe/London and the offset still says -360, the
       * phone moved and Hermes did not.
       */
      if (__DEV__) {
        console.log(
          `[${screen}] today check (${reason}): ` +
            `${new Date(start).toDateString()}` +
            `${start !== lastStart ? " — changed" : ""}, ` +
            `clock ${formatClock(new Date(now), settings.clock24)}, ` +
            `24h ${settings.clock24}, ` +
            `zone offset ${new Date(now).getTimezoneOffset()}, ` +
            `zone ${settings.zone}, ` +
            `next check in ${Math.round(delay / 1000)}s`,
        );
      }
      lastStart = start;
      setTodayStart(start);
      /* Same value as before → React skips the render, as with todayStart. */
      setClock24(settings.clock24);

      timer = setTimeout(() => refresh("midnight timer"), delay);
    };

    refresh("mount");

    const sub = AppState.addEventListener("change", (state) => {
      /* Every state, so a missing "active" shows up as a missing line. */
      if (__DEV__) console.log(`[${screen}] app state: ${state}`);
      if (state === "active") refresh("app coming back");
    });

    return () => {
      if (timer !== null) clearTimeout(timer);
      sub.remove();
    };
  }, [screen]);

  // null means no filter. Holds the name too, so the header can show it
  // without a second lookup.
  const [filter, setFilter] = useState<CategoryChoice>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  /*
   * The title page's period menu: where it opens, counted from the card's
   * top-left corner, or null while it is closed. Set by openMenu from where
   * the ⋯ sits in the card; cleared by a pick, a tap outside it, and
   * Android's back button.
   */
  const [menuAt, setMenuAt] = useState<{ top: number; right: number } | null>(
    null,
  );

  /*
   * Where the card sits on the page: its left edge, its top and its width,
   * from the card's onLayout. Title page only. The menu layer lays a box
   * over the card with these numbers, and opens the menu inside that box.
   */
  const [heroFrame, setHeroFrame] = useState<{
    x: number;
    y: number;
    width: number;
  } | null>(null);

  /* The card and its ⋯, so openMenu can ask where the ⋯ sits in the card. */
  const heroRef = useRef<View>(null);
  const dotsRef = useRef<View>(null);

  /*
   * The row being edited, or null.
   *
   * This screen's sheet ONLY EDITS. Adding moved to the one add sheet in the
   * tab layout, so + never opens this sheet, and the old danger — + opening
   * a form pre-filled with the last row you edited — cannot happen here.
   *
   * openEdit sets it before the sheet shows. closeForm clears it on the way
   * out, so a closed sheet never holds a row that may be deleted later.
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
   *
   * useCallback because the row handlers below call it through
   * endUndoWindow, and they have to keep their identity for ExpenseRow's
   * memo. It only touches a ref and a setter, so it never needs rebuilding.
   */
  const heldRef = useRef<DeletedExpense | null>(null);
  const [held, setHeld] = useState<DeletedExpense | null>(null);
  const holdCopy = useCallback((copy: DeletedExpense | null) => {
    heldRef.current = copy;
    setHeld(copy);
  }, []);

  /*
   * The row that is animating out, for exactly one render.
   *
   * WHY THE DELETE TAKES TWO RENDERS NOW. Reanimated reads `exiting` when a
   * row renders, not when it is removed. If deleteRow set this AND removed
   * the row in one go, React would batch both into a single render, the row
   * would vanish in that render, and it would never have rendered with
   * `exiting` set. No animation, and no error.
   *
   * So deleteRow only sets this. The row renders once with `exiting` on, and
   * the effect below removes it from `rows` straight after.
   *
   * The database write, the total and the offset do NOT wait. They all move
   * inside deleteRow, as before. Only the screen's copy of the row is one
   * render late, and that render happens before any other tap can land.
   */
  const [leavingId, setLeavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!leavingId) return;
    logRowStep("out: first render done");
    setRows((prev) => prev.filter((r) => r.id !== leavingId));
    /* Cleared in the same render the row leaves in. If it stayed set, an
     * Undo of this same row would bring it back with `exiting` already on,
     * and it would fade out the next time it scrolled out of the list. */
    setLeavingId(null);
  }, [leavingId]);

  /*
   * The row that Undo just put back, so it can fade in.
   *
   * Cleared straight after the render it mounts in. `entering` is only read
   * once, at mount, so clearing it cannot cut the fade short. Leaving it set
   * would replay the fade whenever the list recycles this row after a long
   * scroll.
   */
  const [restoredId, setRestoredId] = useState<string | null>(null);

  useEffect(() => {
    if (!restoredId) return;
    setRestoredId(null);
  }, [restoredId]);

  /*
   * Ends the undo window: forgets the held copy, which hides the banner.
   *
   * Nothing is written to the database here. The row already left it when
   * Delete was tapped — there is nothing left to commit.
   *
   * `reason` exists only for the dev log, so every way of ending the window
   * leaves a line saying which one it was.
   *
   * useCallback for the same reason as holdCopy. Its dependencies are
   * holdCopy and `screen`, and neither changes, so this never changes either.
   */
  const endUndoWindow = useCallback(
    (reason: string) => {
      if (!heldRef.current) return;
      holdCopy(null);
      if (__DEV__) console.log(`[${screen}] undo window ended by ${reason}`);
    },
    [holdCopy, screen],
  );

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
   *
   * A delete moves the offset one render before rows. This only logs when
   * rows changes, so it checks the pair after both have moved.
   */
  useEffect(() => {
    if (!__DEV__) return;
    const flag = offsetRef.current === rows.length ? "" : "  <-- MISMATCH";
    console.log(
      `[${screen}] offset ${offsetRef.current} / rows ${rows.length}${flag}`,
    );
    /* Only prints while a row animation is in flight. See logRowStep. */
    logRowStep("list render done");
  }, [rows, screen]);

  /*
   * Go back to page one and re-read the total, KEEPING the filter.
   *
   * One caller: the focus check below. This copy comes back into focus and
   * the expense version moved while it was hidden — a write on another tab
   * is the only way that happens.
   *
   * It reads `filter` from state. That is only safe where the copy of reload
   * being called was made in a render that already had the current filter —
   * see the focus check for why that holds there. Do not call it from a
   * listener made once with [] dependencies: that listener's reload would
   * keep the filter from the first render forever.
   */
  const reload = () => {
    // The list the held row's position belonged to is about to be replaced.
    endUndoWindow("reload");

    const categoryId = filter?.id;

    const first = readPage(rangeRef.current, 0, categoryId, titleOnly);
    offsetRef.current = first.length;
    seenRef.current = expenseVersion();
    setRows(first);
    setTotals(readHeaderTotals(rangeRef.current, categoryId, titleOnly));
  };

  // Switch filter. Takes the choice as an ARGUMENT, never from state —
  // setFilter below does not update `filter` until the next render, so
  // reading it back here would apply the previous tap's category.
  //
  // It reads NO state at all: only its argument, refs, setters, module
  // functions, endUndoWindow, which never changes, and titleOnly, a prop,
  // which never changes for a copy. That is what makes it safe to call from
  // the change listener below, which is created once and keeps the first
  // render's copy of this function. If this function ever starts reading
  // state, that listener silently uses the old value.
  //
  // The range reaches it the same way: rangeRef is a ref, so even the
  // listener's first-render copy of this function reads the current range.
  //
  // It hands back what it read and how long each read took. Only the title
  // page's period menu prints them; every other caller ignores them.
  const applyFilter = (choice: CategoryChoice) => {
    /* Page one of a different set, with totals for a different filter. The
     * held row's position belonged to the list being thrown away, so undo
     * would have nowhere honest to put it. */
    endUndoWindow("applyFilter");

    const categoryId = choice?.id;

    const t0 = Date.now();
    const first = readPage(rangeRef.current, 0, categoryId, titleOnly);
    const pageMs = Date.now() - t0;
    // Page one of a different set. The offset MUST go back to zero, or
    // switching from one category to another asks for rows 300-350 of a set
    // with none.
    offsetRef.current = first.length;
    seenRef.current = expenseVersion();
    // REPLACE, never append. Appending leaves one category's rows above
    // another's.
    setRows(first);
    // The header total narrows with the list. A list showing one category
    // above a total showing everything is a screen that lies quietly.
    const t1 = Date.now();
    const nextTotals = readHeaderTotals(
      rangeRef.current,
      categoryId,
      titleOnly,
    );
    const totalMs = Date.now() - t1;
    setTotals(nextTotals);

    setFilter(choice);
    setSheetOpen(false);

    return {
      rows: first.length,
      pageMs,
      expenses: nextTotals.count,
      totalMs,
    };
  };

  /*
   * Switch the title page to another period, from its ⋯ menu.
   *
   * The range is worked out now and held, so every read until the next
   * switch, or the next 1st, uses the same stretch of time. Then
   * applyFilter(null) reads page one and the total for it, with the title,
   * and ends the undo window: the held row's place belonged to the list
   * being replaced.
   *
   * holdPeriod comes FIRST, because applyFilter reads rangeRef.
   *
   * The log line is printed on every pick. The page always opens on this
   * month, so a year or all time can only be reached from here, and this
   * line is the only timing they get. The sizes are in it because a time
   * means nothing without how much was read.
   */
  const applyPeriod = (next: Period) => {
    setMenuAt(null);
    holdPeriod(next, rangeOf(next, Date.now()));
    const read = applyFilter(null);
    if (__DEV__) {
      console.log(
        `[${screen}] period: ${next} — ` +
          `page: ${read.rows} rows in ${read.pageMs}ms, ` +
          `total: ${read.expenses} expenses in ${read.totalMs}ms`,
      );
    }
  };

  /*
   * Open the period menu just under the ⋯ that opened it.
   *
   * measureLayout asks where the ⋯ sits INSIDE the card. Both are on this
   * page, so the answer comes only from this page's own layout: the
   * window, the status bar and the navigator play no part. (The Modal this
   * replaced needed window numbers, and on the phone the menu landed about
   * 50 too high.)
   *
   * The menu opens 6 below the ⋯'s bottom, its right edge in line with the
   * ⋯'s right edge, the way YouTube's does. Both numbers are counted from
   * the card, because the menu is drawn in a box laid over the card (see
   * the menu layer at the end of the JSX).
   *
   * Opening it ends the undo window, the same as opening the ⋯ sheet on
   * Home.
   */
  const openMenu = () => {
    endUndoWindow("⋯ menu");
    const hero = heroRef.current;
    const dots = dotsRef.current;
    if (!hero || !dots || !heroFrame) return;
    const cardWidth = heroFrame.width;
    dots.measureLayout(hero, (left, top, width, height) => {
      const at = {
        top: top + height + 6,
        right: cardWidth - (left + width),
      };
      /* Where the menu went, so a menu in the wrong place can be traced to
       * the numbers it was placed with. */
      if (__DEV__) {
        console.log(
          `[${screen}] menu: ⋯ at ${Math.round(left)}, ${Math.round(top)} ` +
            `in the card → menu top ${Math.round(at.top)}, ` +
            `right ${Math.round(at.right)}`,
        );
      }
      setMenuAt(at);
    });
  };

  /*
   * Android's back button closes the menu first. Without this, back would
   * leave the page instead.
   *
   * React Native asks back listeners newest first, and stops at the first
   * one that returns true. This one is added when the menu opens, after the
   * navigator's own, so it is asked first. It is removed when the menu
   * closes. Left behind, it would swallow every back press on this page.
   */
  useEffect(() => {
    if (menuAt === null) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setMenuAt(null);
      return true;
    });
    return () => sub.remove();
  }, [menuAt]);

  /*
   * The period check: when the day changes, did the period move too?
   *
   * Runs once after the first render, then whenever todayStart changes — at
   * local midnight, and when the app comes back to the front (see refresh
   * above). On most days nothing moves and it stops after one log line. On
   * the 1st a month moves; on 1 January a year does. Then it holds the new
   * range and shows all of it. All time never moves, and All has no period,
   * so both return at once.
   *
   * applyFilter(null), not reload: a new month starts with no category
   * picked, so the first thing shown of it is all of it. On the title page
   * there is no category, and applyFilter keeps the title.
   *
   * applyFilter reads no state (see the comment above it), so whichever
   * render's copy of it this effect holds, it does the same thing. It is
   * deliberately NOT in the dependency list: it is a new function on every
   * render, and listing it would run this check on every render.
   *
   * holdPeriod comes FIRST, because applyFilter reads rangeRef.
   *
   * applyFilter also ends the undo window, and that matters here: an Undo
   * after the month moved would put last month's expense into this month's
   * list. It also closes the ⋯ sheet, if it was left open across midnight.
   */
  useEffect(() => {
    const p = periodRef.current;
    if (p === null || p === "all") return;
    const current = rangeOf(p, todayStart);
    if (current === null) return;
    const was = rangeRef.current;
    const changed = was?.start !== current.start;
    if (__DEV__) {
      console.log(
        `[${screen}] ${p} check: ${formatPeriod(p, current)} → ` +
          (changed
            ? `changed from ${was ? formatPeriod(p, was) : "none"}, show all`
            : `same ${p}`),
      );
    }
    if (!changed) return;
    holdPeriod(p, current);
    applyFilter(null);
  }, [todayStart, screen, holdPeriod]);

  /*
   * The check a copy runs when it comes back into focus: is what I show
   * still true? Two ways it can be wrong after time on another tab.
   *
   *   1. The filtered category was deleted on Categories. `filter` still
   *      holds an id with no row behind it. The list would return 0 rows and
   *      ৳0, both correct, under a header naming a category that is gone.
   *      → applyFilter(null), and STOP. reload would read `filter` from
   *      state, which still holds the dead category until the next render.
   *
   *   2. The expense version moved while this copy was hidden: an add from
   *      the + on another tab, a delete or edit on the other list, or a
   *      category delete that moved rows. → reload(), which keeps the filter.
   *
   * WHEN THIS RUNS. Every time this copy becomes focused, AND every time
   * `filter` changes while it is focused. useFocusEffect re-runs its
   * callback whenever the callback itself changes and the screen is focused
   * (expo-router 6.0.24, build/useFocusEffect.js, `if
   * (navigation.isFocused())` inside a useEffect on [effect]), and
   * useCallback rebuilds it when `filter` changes. After a ⋯ tap that
   * second run finds nothing to do, because applyFilter has just marked the
   * version seen. That is why the dev line says "check", not "focus".
   *
   * WHY reload SEES THE CURRENT FILTER HERE. The callback is rebuilt every
   * time `filter` changes, and each rebuild holds the reload from that same
   * render. So the reload it calls always read the filter that is current.
   * applyFilter and reload are deliberately NOT in the dependency list: both
   * are new functions on every render, and listing them would re-run this
   * check on every render while focused.
   *
   * The dev line prints on every run, including "up to date", so a check
   * that never ran cannot look like one that ran and found nothing.
   */
  useFocusEffect(
    useCallback(() => {
      /*
       * Above the early return below, so it runs on every focus rather than
       * only when the filter is still valid.
       *
       * The same object is kept when nothing changed. A fresh map every time
       * would be a new value, which changes extraData, which redraws every row
       * on screen for nothing.
       */
      const nextIcons = readCategoryIcons();
      const nextKey = iconsSignature(nextIcons);
      setIcons((prev) =>
        prev.key === nextKey ? prev : { map: nextIcons, key: nextKey },
      );

      if (filter && !readCategories().some((c) => c.id === filter.id)) {
        if (__DEV__) {
          console.log(
            `[${screen}] check: filtered category gone → show all`,
          );
        }
        applyFilter(null);
        return;
      }

      const version = expenseVersion();
      const seen = seenRef.current;
      const stale = version !== seen;
      if (__DEV__) {
        console.log(
          `[${screen}] check: version ${version}, seen ${seen} → ` +
            (stale ? "reload" : "up to date"),
        );
      }
      if (stale) reload();
    }, [filter, screen]),
  );

  /*
   * While focused, this copy listens. Leaving the screen stops it, and ends
   * the undo window — and with tabs, switching tab IS leaving the screen.
   * The effect runs when this copy gains focus, and the function it returns
   * runs when it loses focus (expo-router 6.0.24, build/useFocusEffect.js:
   * its 'focus' and 'blur' listeners).
   *
   * Why the undo window must end: the Categories tab can delete the category
   * the held row points at. Foreign keys are enforced, so a restore after
   * coming back would throw.
   *
   * Two things are listened to:
   *
   *   either + asking for the add sheet
   *       ends the undo window, the same as opening the form always did.
   *
   *   the expense version moving
   *       Told in a microtask, after the writing handler has returned. If the
   *       write was this copy's own, its handler has already marked the
   *       version seen, and this finds nothing to do.
   *
   *       Any other expense write while this copy is focused is an add from
   *       a +. Every other expense write in the app either happens in this
   *       copy (deleteRow, undoDelete, saveEdit) or on another tab, and
   *       reaching another tab blurs this one first. So the answer is what
   *       the add always did on the screen it was made from: clear this
   *       copy's filter and show page one, where the new row sits on top.
   *
   *       If that reasoning is ever wrong, nothing shows wrong money:
   *       applyFilter(null) re-reads everything. The only cost is a filter
   *       cleared when nobody expected it.
   *
   *       On the title page no + is on screen, so this never fires there
   *       today. If it ever did, applyFilter(null) re-reads the page's own
   *       title and period: it has no filter to clear.
   *
   * Only the copy on screen listens. A hidden copy hears nothing, and
   * compares the version once, in the focus check above.
   *
   * Empty dependencies, so the callback is made once, at the first render,
   * and every focus runs that same callback with the first render's
   * functions. Safe because endUndoWindow never changes and applyFilter
   * reads no state (see the comment above applyFilter).
   */
  useFocusEffect(
    useCallback(() => {
      const stopAddListening = onAddSheetRequested(() =>
        endUndoWindow("openAdd"),
      );

      const stopHearing = onExpensesChanged(() => {
        const version = expenseVersion();
        const seen = seenRef.current;
        const own = version === seen;
        if (__DEV__) {
          console.log(
            `[${screen}] heard: version ${version}, seen ${seen} → ` +
              (own ? "own write, nothing" : "show all"),
          );
        }
        if (!own) applyFilter(null);
      });

      return () => {
        stopAddListening();
        stopHearing();
        endUndoWindow("leaving the screen");
      };
    }, []),
  );

  const loadMore = () => {
    // totals.count is the FILTERED count, so this guard already knows when
    // it has reached the end of an empty category. On Home it is also this
    // month's count; on the title page, the title's count in its period.
    if (offsetRef.current >= totals.count) {
      return;
    }

    // The filter has to reach here too. Miss it and scrolling to the bottom
    // of one category quietly starts appending another's rows underneath.
    // The range and the title likewise: without rangeRef, page two of
    // October would be page two of every expense ever.
    const next = readPage(
      rangeRef.current,
      offsetRef.current,
      filter?.id,
      titleOnly,
    );
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
   *
   * useCallback: this is a row prop, so it must keep its identity for
   * ExpenseRow's memo. It reads only a ref and endUndoWindow.
   */
  const closePreviousRow = useCallback(
    (opening: SwipeableMethods | null) => {
      /* Any row starting to open ends the undo window. Reaching the next
       * Delete button takes a swipe, which is why two deletes never
       * overlap. */
      endUndoWindow("swipe");

      // The !== guard matters. A row re-opening itself would otherwise be
      // told to close in the middle of opening, and the swipe would look
      // dead.
      if (openRowRef.current && openRowRef.current !== opening) {
        openRowRef.current.close();
      }
      openRowRef.current = opening;
    },
    [endUndoWindow],
  );

  /* ─── Opening a title's page ────────────────────────────────────────── */

  /*
   * A tap on a card opens the page for that expense's title.
   *
   * The route carries the expense's id, not its title: see
   * readExpenseTitle in db/expenses.ts for why.
   *
   * The page opens OVER the tabs. That blurs this copy, and the
   * leaving-the-screen effect above ends the undo window, the same as
   * switching tab does.
   *
   * useCallback: a row prop, so it must keep its identity for ExpenseRow's
   * memo. It reads nothing from this component, so its dependency list is
   * empty because it really has none.
   */
  const openTitle = useCallback((e: Expense) => {
    router.push({ pathname: "/title/[id]", params: { id: e.id } });
  }, []);

  /* ─── Opening and closing the form ──────────────────────────────────── */

  /*
   * useCallback: a row prop, so it must keep its identity for ExpenseRow's
   * memo. It reads a module function, a ref, two setters and endUndoWindow —
   * none of which change between renders.
   */
  const openEdit = useCallback(
    (e: Expense, methods: SwipeableMethods | null) => {
      /* A backstop. The swipe that revealed this Edit button has already
       * ended the window, so this only logs if Edit ever becomes reachable
       * some other way. */
      endUndoWindow("openEdit");

      /*
       * Read the row fresh rather than using the object already in `rows`.
       *
       * That object came from the list query, which does not select
       * category_id — so it cannot tell the form which category to show.
       * This lookup is by PRIMARY KEY and measured at 2-3ms warm, which is
       * cheaper than widening the list query and invalidating its recorded
       * timings.
       */
      const full = readExpenseForEdit(e.id);

      /* On screen but gone from the database. The list is stale, so there
       * is nothing to edit, and opening an empty form would be worse than
       * doing nothing at all. */
      if (!full) return;

      /* Point the ref at THIS row before the sheet opens. Tapping Edit does
       * not by itself mean this row was the last one swiped, and a stale
       * handle here would close the wrong row on save. */
      openRowRef.current = methods;

      // Both setters run in one event handler, so React batches them into a
      // single render. The Modal becomes visible and ExpenseForm mounts with
      // `editing` already set, which is what its initialisers read.
      setEditing(full);
      setFormOpen(true);
    },
    [endUndoWindow],
  );

  const closeForm = () => {
    /*
     * Close the swiped row on the way out — after Save, and after dismissing
     * the sheet without saving.
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

    if (__DEV__) {
      /* The card's icon comes from categoryId, so a card that looks unchanged
       * after an edit has two possible causes: the category never changed, or
       * it changed and the row in state did not follow. One line tells them
       * apart instead of a second run. */
      console.log(
        `[${screen}] edit saved: category ${target.category?.id ?? "none"} -> ${categoryId}`,
      );
    }

    /* This copy patches itself below, so the new version is already shown.
     * Marked seen now, inside the handler, so the listener finds nothing to
     * do when it is told after the handler returns. */
    seenRef.current = expenseVersion();

    /*
     * Does this row still belong in what is on screen? Two questions, and
     * both must be yes:
     *
     *   the category   with no filter, every category belongs
     *   the title      only on the title page: is the new title still the
     *                  page's title? Compared by sameTitle, which folds A-Z
     *                  the way the page's query does. "tea" stays on the Tea
     *                  page; "Coffee" leaves it.
     *
     * The period never decides this: created_at is not written, so the row
     * stays inside whatever stretch of time it was in.
     */
    const stillInView =
      (!filter || filter.id === categoryId) &&
      (titleOnly === undefined || sameTitle(title, titleOnly));

    if (stillInView) {
      /*
       * map, not filter. Replaces one element and keeps the array length, so
       * the row stays exactly where it is. created_at was not written, so its
       * position in the sort has not moved either.
       */
      setRows((prev) =>
        prev.map((r) =>
          r.id === target.id
            ? /* categoryId is in this patch because the list row carries it
               * now. Left out, the row would keep the OLD category after you
               * move an expense to a new one, and the card would show the old
               * icon until something re-read the list. Nothing throws, and the
               * typecheck cannot see it: the spread carries the stale value. */
              { ...r, title, amountMinor, currencyCode: currency, categoryId }
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
       * A row left the set on screen, so every row after it in the database
       * moved down one position. This counter says how many rows we have
       * already taken. Leave it one too high and the next page starts one row
       * too late, and that row is never seen.
       */
      offsetRef.current -= 1;
    }

    closeForm();
  };

  /* The sheet on this screen only edits; adding lives in the tab layout.
   * `editing` is always set while this sheet is open — openEdit sets it before
   * showing the sheet — so the early return is a guard, not a path. Safe to
   * read from state here for the same reason reload() reads `filter`: this
   * only runs from an event handler, after the render that set it. */
  const submitExpense = (
    title: string,
    amountMinor: Minor,
    currency: string,
    categoryId: string,
  ) => {
    if (!editing) return;
    saveEdit(editing, title, amountMinor, currency, categoryId);
  };

  /* ─── Delete and undo ───────────────────────────────────────────────── */

  /*
   * Delete a row, and keep a copy so Undo can bring it back.
   *
   * The same three places as saveEdit's leaving-the-filter branch, with the
   * test removed: a deleted row always leaves the list, so the offset always
   * moves. The one difference is that `rows` changes one render later, in
   * the leavingId effect, so the row can animate out.
   *
   * useCallback: a row prop, so it must keep its identity for ExpenseRow's
   * memo. setTotals takes a function rather than reading `totals`, so this
   * never needs the current state and never needs rebuilding.
   */
  const deleteRow = useCallback(
    (e: Expense) => {
      /* A second delete while the banner shows makes the first one final.
       * In practice the swipe that revealed this button has already ended
       * the window, so this only logs if that ever stops being true. */
      endUndoWindow("deleteRow");

      /* The database first. If this throws, none of the screen changes
       * below happen, so the screen cannot show a delete that did not
       * occur. */
      const copy = deleteExpense(e.id);

      /* Own write, patched by hand below. Same reason as in saveEdit: a
       * re-read here would throw away the scroll and the exit animation. */
      seenRef.current = expenseVersion();

      /* The Delete button sits inside the only open row, and that row is
       * about to unmount. Forget its handle, so the next swipe does not try
       * to close a row that is gone. */
      openRowRef.current = null;

      /* NOT setRows. The leavingId effect removes the row one render later,
       * after it has rendered once with `exiting` switched on. */
      rowAnimStartedAt = Date.now();
      rowAnimScreen = screen;
      setLeavingId(copy.id);

      setTotals((t) => ({
        count: t.count - 1,
        totalMinor: asMinor(t.totalMinor - copy.amountMinor),
      }));
      /* Same line, same reason, as in saveEdit. It moves now, with the
       * database, not later with `rows`. */
      offsetRef.current -= 1;

      holdCopy(copy);
      draggedSinceDeleteRef.current = false;
    },
    [endUndoWindow, holdCopy, screen],
  );

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

    /* Own write, patched by hand below. Same reason as in saveEdit. */
    seenRef.current = expenseVersion();

    /*
     * Rebuilt field by field so the list holds exactly what the list query
     * would have returned — and that now includes categoryId, because the
     * list query selects it. Taking it from the copy is what puts the row back
     * carrying its own icon instead of the placeholder.
     */
    const row: Expense = {
      id: copy.id,
      title: copy.title,
      amountMinor: copy.amountMinor,
      currencyCode: copy.currencyCode,
      createdAt: copy.createdAt,
      categoryId: copy.categoryId,
    };

    /* Unlike exiting, one render is enough here. The row mounts in this
     * render, and `entering` is read at mount. */
    rowAnimStartedAt = Date.now();
    rowAnimScreen = screen;
    setRestoredId(row.id);

    setRows((prev) => insertInSortOrder(prev, row));
    setTotals((t) => ({
      count: t.count + 1,
      totalMinor: asMinor(t.totalMinor + copy.amountMinor),
    }));
    offsetRef.current += 1;

    endUndoWindow("undoDelete");
  };

  const empty =
    titleOnly !== undefined
      ? titleEmptyText(titleOnly, period)
      : emptyText(filter, range);

  /*
   * The card's two lines of words, worked out here so the JSX stays plain.
   * Both are drawn from `period` and `range`, the same ones the rows were
   * read with, so the words cannot name a different stretch of time.
   *
   *   periodLine   Home: "October 2026". Title page: "October 2026",
   *                "2026" or "All time". null draws nothing.
   *   cardLabel    Home: the picked category, or "Spent this month".
   *                Title page: "Spent this month", "Spent this year" or
   *                "Spent in total".
   */
  const periodLine =
    titleOnly !== undefined
      ? formatPeriod(period, range)
      : range
        ? formatMonth(range)
        : null;
  const cardLabel =
    titleOnly !== undefined
      ? periodLabel(period)
      : filter
        ? filter.name
        : range
          ? "Spent this month"
          : "Spent Recently";

  return (
    /*
     * The title page pads all four edges; the tab screens pad three. See
     * SAFE_EDGES and SAFE_EDGES_ALL.
     */
    <SafeAreaView
      style={styles.screen}
      edges={titleOnly !== undefined ? SAFE_EDGES_ALL : SAFE_EDGES}
    >
      {/* With the header gone, the clock and battery sit straight on the
          black page. The system draws them dark by default, which would be
          invisible here, so this asks for light ones. On Android below
          API 31 React Native sets the older SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
          from 31 up it uses WindowInsetsController. Both are covered. */}
      <StatusBar barStyle="light-content" />

      {/* The title page's bar: only ‹, on the black above the card. The
          title itself is on the card. Back pops this page off the root
          stack, and Home underneath runs its focus check. */}
      {titleOnly !== undefined && (
        <View style={styles.bar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Text style={styles.barBack}>‹</Text>
          </Pressable>
        </View>
      )}

      {/* The top card: what is being shown, how much, and +. Home and the
          title page. All expenses gets a plain bar with a back button
          instead, like the Categories screen. */}
      {showTopCard ? (
        <View
          ref={heroRef}
          style={styles.hero}
          // Title page only: where the card is on the page, for the menu
          // layer. Home has no menu, so it skips the extra render.
          onLayout={
            titleOnly !== undefined
              ? (e) => {
                  const { x, y, width } = e.nativeEvent.layout;
                  setHeroFrame({ x, y, width });
                }
              : undefined
          }
        >
          <View style={styles.heroTop}>
            {/* The 3-dot. On Home it opens the category sheet; on the title
                page, the small period menu. dotsRef lets openMenu measure
                where it sits in the card. */}
            <Pressable
              ref={dotsRef}
              accessibilityRole="button"
              accessibilityLabel={
                titleOnly !== undefined
                  ? "Choose a period"
                  : "Filter by category"
              }
              android_ripple={RIPPLE_ON_LIGHT}
              style={({ pressed }) => [styles.heroIconButton, iosPressed(pressed)]}
              onPress={
                titleOnly !== undefined
                  ? openMenu
                  : () => {
                      endUndoWindow("⋯ sheet");
                      setSheetOpen(true);
                    }
              }
              hitSlop={12}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={INK} />
            </Pressable>
          </View>

          {/* The title page's title, in the white space Home leaves empty
              above the month. */}
          {titleOnly !== undefined && (
            <Text style={styles.heroTitle} numberOfLines={1}>
              {titleOnly}
            </Text>
          )}

          {periodLine !== null && (
            <Text
              style={[
                styles.monthLabel,
                titleOnly !== undefined && styles.monthLabelUnderTitle,
              ]}
              numberOfLines={1}
            >
              {periodLine}
            </Text>
          )}

          {/* numberOfLines is what actually truncates. Without it a long
              category name wraps to a second line and pushes the total down. */}
          <Text
            style={[
              styles.headerLabel,
              periodLine !== null && styles.headerLabelUnderMonth,
            ]}
            numberOfLines={1}
          >
            {cardLabel}
          </Text>

          <Text style={styles.headerTotal}>
            {formatMoney(totals.totalMinor, DEFAULT_CURRENCY)}
          </Text>

          {titleOnly !== undefined ? (
            /* The count sits where Home has its +. Its box has no fixed
               height, so this card is shorter than Home's. */
            <View style={styles.heroCountBox}>
              <Text style={styles.heroCount}>
                {`${totals.count} ${totals.count === 1 ? "expense" : "expenses"}`}
              </Text>
            </View>
          ) : (
            /* The add button. It asks the tab layout for its add sheet — the
               same sheet the tab bar's + opens, so both buttons add the same
               way. The undo window ends through this copy's
               onAddSheetRequested listener (the leaving-the-screen effect). */
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add expense"
              android_ripple={RIPPLE}
              style={({ pressed }) => [styles.heroAdd, iosPressed(pressed)]}
              onPress={requestAddSheet}
            >
              <Ionicons name="add" size={30} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.bar}>
          {/* In the tab bar, back means the first tab, Home: React
              Navigation's tab router goes back with backBehavior
              'firstRoute' unless told otherwise. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Text style={styles.barBack}>‹</Text>
          </Pressable>
          <Text style={styles.barTitle}>All expenses</Text>
          {/* Balances the back chevron so the title sits centred. */}
          <View style={styles.barSpacer} />
        </View>
      )}

      {/* The undo row, shown for as long as a deleted row is held.

          The one piece of mechanism is the condition: it reads `held`, so it
          fades away exactly when the window ends, whatever ended it. */}
      {held && (
        <Animated.View
          entering={UNDO_IN}
          exiting={UNDO_OUT}
          style={styles.undoRow}
        >
          {/* Crossed out: this expense is already gone from the database,
              and the row says so before Undo is read. */}
          <Text style={[styles.undoText, styles.undoTitle]} numberOfLines={1}>
            {held.title}
          </Text>
          <Text style={[styles.undoText, styles.undoAmount]}>
            {formatMoney(held.amountMinor, held.currencyCode)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Undo deleting ${held.title}`}
            android_ripple={RIPPLE_ROUND}
            style={({ pressed }) => iosPressed(pressed)}
            onPress={undoDelete}
            hitSlop={12}
          >
            <Text style={styles.undoAction}>Undo</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Slides the list down when the undo row appears above it, and back
          up when it goes, instead of jumping. See LIST_MOVE.

          flex: 1 on this view takes the space between the header and the
          dev row. The list keeps its own flex: 1 and fills this view. */}
      <Animated.View layout={LIST_MOVE} style={styles.listArea}>
        {/* Dev-only timing for the list. See logListRender. In a release
          build this renders the list and nothing else. */}
        <Profiler id={screen} onRender={logListRender}>
          <Animated.FlatList
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
            /*
             * The rows BELOW a leaving or arriving row slide into place instead
             * of jumping. Reanimated wraps every row in its own animated view to
             * do this, which is why this is Animated.FlatList and not FlatList.
             */
            itemLayoutAnimation={LinearTransition}
            /*
             * Makes sure the rows render again when leavingId, restoredId,
             * todayStart or clock24 changes. None of them is part of `data`,
             * and FlatList only promises to re-render its rows when `data` or
             * this prop changes. Without it, the leaving row might never
             * render with `exiting` on, at midnight the rows might keep
             * "Today", and after the 24-hour switch they might keep "PM".
             *
             * KNOWN ISSUE: every CELL still renders again on every render of
             * this screen. The props written inline on this list are new
             * objects each time, so FlatList renders each time, and hands each
             * cell a brand-new renderItem wrapper. ExpenseRow is memo'd, so
             * inside each cell the row itself can stop there — but the cell,
             * the renderItem call and Reanimated's animated wrapper around the
             * cell still run. The list Profiler measures what is left.
             */
            extraData={`${leavingId}|${restoredId}|${todayStart}|${clock24}|${icons.key}`}
            /*
             * Different empty screens. An empty app needs "add one"; an
             * empty filter needs the way back out, so only it gets Show all.
             * The title page's empty month or year gets Show all time, its
             * way out.
             *
             * No flash at launch: the first page is read inside useState's
             * initialiser, before the first render, so `rows` is never [] for
             * one render while data exists.
             *
             * The list keeps this element's own `style`, so styles.empty's
             * flex: 1 plus the content container's flexGrow: 1 is what centres
             * it in the space below the header.
             */
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{empty.title}</Text>
                <Text style={styles.emptyBody}>{empty.body}</Text>
                {filter && (
                  <Pressable
                    accessibilityRole="button"
                    android_ripple={RIPPLE_ROUND}
                    style={({ pressed }) => [
                      styles.emptyAction,
                      iosPressed(pressed),
                    ]}
                    onPress={() => applyFilter(null)}
                    hitSlop={12}
                  >
                    <Text style={styles.emptyActionText}>Show all</Text>
                  </Pressable>
                )}
                {titleOnly !== undefined && period !== "all" && (
                  <Pressable
                    accessibilityRole="button"
                    android_ripple={RIPPLE_ROUND}
                    style={({ pressed }) => [
                      styles.emptyAction,
                      iosPressed(pressed),
                    ]}
                    onPress={() => applyPeriod("all")}
                    hitSlop={12}
                  >
                    <Text style={styles.emptyActionText}>Show all time</Text>
                  </Pressable>
                )}
              </View>
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
            renderItem={({ item: e }) => {
              const icon = iconForRow(e.categoryId, icons.map);
              return (
                <ExpenseRow
                  expense={e}
                  iconName={icon.name}
                  iconColor={icon.color}
                  iconTint={icon.tint}
                  leaving={e.id === leavingId}
                  todayStart={todayStart}
                  clock24={clock24}
                  restoring={e.id === restoredId}
                  onEdit={openEdit}
                  onDelete={deleteRow}
                  onWillOpen={closePreviousRow}
                  onOpen={titleOnly === undefined ? openTitle : null}
                />
              );
            }}
          />
        </Profiler>
      </Animated.View>

      {/*
        DEV TOOLS — commented out. To bring them back:

          1. Delete the two lines that open and close the block below.
          2. Do the same around the devTools import at the top of the file.
          3. Run npm run typecheck. Commented-out code is never typechecked,
             so anything renamed in db/devTools.ts since only shows up then.

        Nothing floats over the list any more, so the dev row needs no room
        made for it. It sits under the list and wraps to several lines.

        Add index and Drop index stay inside the __DEV__ guard because
        dropListIndex in a real user's hands is unrecoverable.

        KNOWN ISSUE: seedFakeExpenses throws, because two of its hardcoded
        category ids no longer exist. Never tap Clear seed first — the 50,000
        seeded rows would be gone with no way to put them back.
      */}
      {/*
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
      */}

      {/* The category sheet is Home's ⋯. The title page's ⋯ opens the
          period menu below instead, so the sheet is not drawn there at
          all. */}
      {titleOnly === undefined && (
        <CategorySheet
          visible={sheetOpen}
          // The same range the list and the total behind the sheet were read
          // with, so its numbers cover the same stretch of time. A state
          // object, the same one on every render until the month changes.
          range={range}
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
      )}

      <BottomSheet visible={formOpen} title="Edit expense" onClose={closeForm}>
        {/*
          key forces a fresh mount whenever the target changes.

          ExpenseForm reads `initial` in its useState initialisers, which run
          on mount only. A hidden Modal already unmounts its children, so this
          is belt and braces — but it is one string and it makes the pre-fill
          correct even if the sheet ever stops unmounting.
        */}
        <ExpenseForm
          key={editing?.id}
          initial={editing}
          submitLabel="Save"
          onSubmit={submitExpense}
        />
      </BottomSheet>

      {/*
        The title page's period menu: a small box under the ⋯, like
        YouTube's.

        NOT a Modal. A Modal is its own window, and on the phone its numbers
        and this page's numbers did not line up: the menu opened about 50
        too high, over the ⋯. This layer is part of the page, so the card's
        numbers and the menu's numbers are the same numbers.

        It is the LAST thing on the page, so it draws over everything else
        here, the list included. Three parts:

          the Pressable    fills the page behind the menu. A tap anywhere
                           outside the menu closes it.
          the box          lies exactly over the card, from heroFrame, and
                           reaches to the bottom of the page so the menu
                           always fits inside it. box-none lets taps
                           through it to the Pressable.
          the menu         sits in that box at menuAt.

        YOURS TO RESTYLE: menu, menuItem, menuItemDivider, menuText in the
        styles below.
      */}
      {titleOnly !== undefined && menuAt && heroFrame && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Close the menu"
            onPress={() => setMenuAt(null)}
          />
          <View
            style={[
              styles.menuOverCard,
              { top: heroFrame.y, left: heroFrame.x, width: heroFrame.width },
            ]}
          >
            <View
              accessibilityRole="menu"
              style={[styles.menu, { top: menuAt.top, right: menuAt.right }]}
            >
              {PERIODS.map((p, i) => (
                <Pressable
                  key={p.key}
                  accessibilityRole="menuitem"
                  android_ripple={RIPPLE}
                  style={({ pressed }) => [
                    styles.menuItem,
                    // A line between rows: above every row but the first.
                    i > 0 && styles.menuItemDivider,
                    iosPressed(pressed),
                  ]}
                  onPress={() => applyPeriod(p.key)}
                >
                  <Text style={styles.menuText}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /*
   * YOURS TO RESTYLE — the colours. The reference design, flipped for dark
   * mode: a black page, a WHITE top card, and dark grey list cards. Text and
   * icons inside the top card are dark (INK); everything else is light.
   */
  screen: { flex: 1, backgroundColor: "#000000" },

  // YOURS TO RESTYLE — the top card.
  hero: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  // Stretches across the card so the ⋯ can sit in its top-right corner.
  heroTop: {
    alignSelf: "stretch",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  /*
   * The round buttons in the card. overflow: hidden keeps the Android ripple
   * inside the circle. It would also clip a shadow on iOS, which is why a
   * button with a shadow can only use it on Android; these have none, so it
   * is safe on both.
   */
  heroIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  /*
   * YOURS TO RESTYLE — the month above the label: bold like the total,
   * smaller. It takes over the white space above the label (marginTop 96),
   * so the card is one line taller than before. Lower the 96 to win it back.
   */
  monthLabel: {
    color: INK,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 96,
  },
  /* The label sits just under the month when there is one. Without a month
   * it keeps its own marginTop below. */
  headerLabelUnderMonth: { marginTop: 4 },
   headerLabel: {
    color: "#6E6E73",
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    // YOURS TO RESTYLE: the white space between the ⋯ row and the label.
    // This is what makes the card taller from the top. The space under
    // the + is the card's paddingBottom, and is separate.
    marginTop: 96,
    // Centred text still needs a limit, or numberOfLines has no width to
    // truncate at.
    maxWidth: "100%",
  },
  headerTotal: {
    color: INK,
    fontSize: 40,
    fontWeight: "700",
    marginTop: 6,
    fontVariant: ["tabular-nums"],
  },
  heroAdd: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: 18,
    // The one dark thing on the white card, so + is the first thing seen.
    // Its icon is white and its ripple is the white one.
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  /*
   * YOURS TO RESTYLE — the title page's card. Shorter than Home's on
   * purpose: 8 above the title, 16 between the title and the month, and 10
   * between the total and the count.
   */
  heroTitle: {
    color: INK,
    fontSize: 30,
    fontWeight: "700",
    marginTop: 8,
    // Centred text still needs a limit, or numberOfLines has no width to
    // truncate at.
    maxWidth: "100%",
  },
  monthLabelUnderTitle: { marginTop: 16 },
  /*
   * No height, so the box is exactly as tall as the count's text.
   * justifyContent: "center" went with the height: it only centres inside
   * spare height, and there is none now.
   */
  heroCountBox: { marginTop: 10 },
  heroCount: { color: "#6E6E73", fontSize: 13 },

  /*
   * The box the menu layer lays over the card. Its top, left and width
   * come from heroFrame; bottom: 0 stretches it to the bottom of the page,
   * so the menu fits inside it however short the card gets. box-none: the
   * box itself takes no taps, the menu inside it does.
   */
  menuOverCard: { position: "absolute", bottom: 0, pointerEvents: "box-none" },
  /*
   * YOURS TO RESTYLE — the title page's period menu.
   *
   * No width: an absolute box with only top and right set is as wide as its
   * widest row. overflow: hidden keeps the rows' ripples inside the rounded
   * corners. elevation gives it Android's shadow.
   */
  menu: {
    position: "absolute",
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#2C2C2E",
    overflow: "hidden",
    elevation: 8,
  },
  menuItem: { paddingVertical: 12, paddingHorizontal: 16 },
   /* 1, not StyleSheet.hairlineWidth: a hairline is one physical pixel,
   * 0.38 on a Pixel 8, and too thin to see on this dark grey. */
  menuItemDivider: {
    borderTopWidth: 1,
    borderTopColor: "#636366",
  },
  menuText: { color: "#FFFFFF", fontSize: 16 },

  // YOURS TO RESTYLE — the All expenses bar, and the title page's ‹ above
  // its card. Copied from the Categories screen's header, so they read as
  // the same kind of screen.
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  barBack: { color: "#ECEDEE", fontSize: 30, fontWeight: "300", marginTop: -6 },
  barTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  barSpacer: { width: 18 },

  // YOURS TO RESTYLE — the undo row. The same card shape as an expense.
  undoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#1C1C1E",
  },
  undoText: {
    color: "#8A8F98",
    fontSize: 14,
    textDecorationLine: "line-through",
  },
  undoTitle: { flex: 1, paddingRight: 12 },
  undoAmount: { fontVariant: ["tabular-nums"], marginRight: 16 },
  listArea: { flex: 1 },
  undoAction: { color: "#E5484D", fontSize: 14, fontWeight: "700" },

  /*
   * paddingBottom only needs a little room now. Nothing floats over the
   * list since the + moved into the top card.
   *
   * flexGrow: 1 lets the content fill the list's height even when there are
   * no rows, which is what lets the empty state centre itself. With rows it
   * changes nothing visible: they still start at the top.
   */
  list: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 24,
    flexGrow: 1,
  },

  // The space between two cards. Mechanism: see the comment where it is used.
  rowGap: { marginBottom: 10 },

  /*
   * YOURS TO RESTYLE — the expense card. Two things here are mechanism:
   *
   *   backgroundColor  must stay opaque. The swipe buttons sit behind the
   *                    card, and a see-through card would show them through
   *                    the text mid-slide.
   *   overflow         keeps the tap ripple inside the rounded corners, as
   *                    on the round buttons. The card has no shadow, so on
   *                    iOS it cuts nothing off.
   */
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#1C1C1E",
    overflow: "hidden",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    // No backgroundColor here. Every row supplies its own, from its category's
    // colour or from the grey placeholder, so one declared here would never
    // apply.
    alignItems: "center",
    justifyContent: "center",
  },
  // flex: 1 takes the room between the icon and the amount, so a long title
  // truncates instead of pushing the amount off the card.
  cardText: { flex: 1 },
  rowTitle: { color: "#ECEDEE", fontSize: 16, fontWeight: "500" },
  rowWhen: { color: "#8A8F98", fontSize: 13, marginTop: 2 },
  rowAmount: {
    color: "#ECEDEE",
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },

  /*
   * Mechanism: this wrapper keeps Edit before Delete, and ReanimatedSwipeable
   * measures how far the row travels from where this wrapper STARTS
   * (ReanimatedSwipeable.tsx lines 280-283, via an empty view placed just to
   * its left). So marginLeft is counted in the travel automatically: the
   * row opens 88 + 88 + 8.
   *
   * No vertical margin, so the pair is exactly the card's height, and the
   * same radius as the card, so the open row reads as one piece. The gap
   * below the card is outside the swipeable (rowGap), so it is not added to
   * the buttons.
   *
   * YOURS TO RESTYLE: the gap and the rounding. The pair is rounded as ONE
   * block — no gap between the two buttons, so only the outer corners are
   * round. overflow: hidden is what cuts the square buttons and their
   * ripples to that shape.
   */
  rowActions: {
    flexDirection: "row",
    marginLeft: 8,
    borderRadius: 16,
    overflow: "hidden",
  },

  // YOURS TO RESTYLE. One thing here is mechanism: `width`. Both buttons
  // use it, so the row now travels two widths when it opens. Change it and
  // you change the throw.
  //
  // No height and no borderRadius here: the wrapper stretches both buttons
  // to its own height, and its overflow: hidden rounds the outer corners.
  rowAction: {
    width: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  rowActionEdit: { backgroundColor: "#636366" },
  // Delete is the one loud colour, so it reads as destructive before the
  // icon is read.
  rowActionDelete: { backgroundColor: "#FF453A" },

  // YOURS TO RESTYLE — the empty screens.
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  emptyTitle: { color: "#ECEDEE", fontSize: 17, fontWeight: "600" },
  emptyBody: { color: "#8A8F98", fontSize: 14, marginTop: 6 },
  emptyAction: { marginTop: 16, paddingHorizontal: 12, paddingVertical: 6 },
  emptyActionText: { color: "#E5484D", fontSize: 15, fontWeight: "700" },

  // iOS only — see iosPressed. Android shows its ripple instead.
  iosPressed: { opacity: 0.6 },

  footer: {
    color: "#8A8F98",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 16,
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