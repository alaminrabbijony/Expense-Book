import {
  addSheetTitle,
  onAddSheetRequested,
  requestAddSheet,
} from "@/comp/addSheet";
import BottomSheet from "@/comp/BottomSheet";
import ExpenseForm from "@/comp/ExpenseForm";
import { insertExpense } from "@/db/expenses";
import type { Minor } from "@et/shared";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import { type ComponentProps, useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";
import {
  DARK,
  LIGHT,
  PALETTES,
  schemeOf,
  type Palette,
  type Scheme,
} from "@/theme/palette";

/*
 * `import type` from @react-navigation/bottom-tabs: only the TYPE of the
 * options is used, and a type import is erased before the app runs. So this
 * adds no runtime dependency — expo-router already ships bottom-tabs.
 */

type IconName = ComponentProps<typeof Ionicons>["name"];

/*
 * One tab's icon: filled while its tab is showing, outline otherwise.
 * YOURS TO RESTYLE: the icon names. Each was checked against Ionicons
 * 15.1.1's glyph map, and a misspelt name is a type error, not a blank icon.
 *
 * `color` and `size` come from the tab bar, so the active and inactive
 * colours in TAB_OPTIONS reach the icon without being repeated here.
 *
 * The returned function is NAMED, and the name is lower case on purpose. The
 * tab bar calls it — `renderIcon({ focused, size, color })` — rather than
 * mounting it, so it is a render function and not a component, and a
 * PascalCase name would claim otherwise. Anonymous, it also showed up in a
 * stack trace with no name at all.
 */
const tabIcon = (
  filled: IconName,
  outline: IconName,
): BottomTabNavigationOptions["tabBarIcon"] =>
  function renderTabIcon({ focused, color, size }) {
    return (
      <Ionicons name={focused ? filled : outline} size={size} color={color} />
    );
  };

/*
 * Options for every tab. YOURS TO RESTYLE: the colours.
 *
 * headerShown: false. Every screen draws its own top: Home its card, the
 * others their own bar.
 *
 * NO `height` IN tabBarStyle. The bar's height is 49 plus the bottom inset
 * (the system navigation bar), and that inset is added as padding INSIDE the
 * bar (bottom-tabs 7.18.16, BottomTabBar.tsx: getTabBarHeight, and
 * paddingBottom: insets.bottom). A height written here REPLACES the whole
 * sum, so the system bar's share would come out of the icons' room.
 *
 * sceneStyle paints the area behind each screen. Every tab screen sits on a
 * Background view painted with the theme's background, which is light grey
 * (rgb 242, 242, 242) in the default theme (@react-navigation/elements,
 * Background.tsx). Anywhere a screen does not paint, that grey would show.
 *
 * Built once, at module level, like every options object in this app.
 */
const makeTabOptions = (c: Palette): BottomTabNavigationOptions => ({
  headerShown: false,
  /*
   * The two label colours are textStrong and textDim, not tokens of their
   * own. They already match in both modes — 21.00 and 6.46 against the dark
   * bar, 18.82 and 4.54 against the light one — and a second pair holding
   * the same values is a pair that can silently drift apart.
   */
  tabBarActiveTintColor: c.textStrong,
  tabBarInactiveTintColor: c.textDim,
  /*
   * The bar uses `page`, like the scene behind it. In dark that is the black
   * it has always been; in light it is #F2F2F7, so the bar sits level with
   * the page and the line above it is what gives it an edge.
   */
  tabBarStyle: { backgroundColor: c.page, borderTopColor: c.line },
  sceneStyle: { backgroundColor: c.page },
});

/*
 * One finished options object per palette, built at module load.
 *
 * NOT built inside TabsLayout. screenOptions is read by the navigator, and a
 * new object on every render makes it reconfigure every screen — the same
 * reason every options object in this app is module level. Two objects exist
 * for the life of the app and a theme switch picks between them.
 */
const TAB_OPTIONS: Record<Scheme, BottomTabNavigationOptions> = {
  dark: makeTabOptions(DARK),
  light: makeTabOptions(LIGHT),
};

/* `title` is the label under each icon. */
const HOME_OPTIONS: BottomTabNavigationOptions = {
  title: "Home",
  tabBarIcon: tabIcon("home", "home-outline"),
};
const ALL_OPTIONS: BottomTabNavigationOptions = {
  title: "All",
  tabBarIcon: tabIcon("list", "list-outline"),
};
const CATEGORIES_OPTIONS: BottomTabNavigationOptions = {
  title: "Categories",
  tabBarIcon: tabIcon("pricetags", "pricetags-outline"),
};
const SETTINGS_OPTIONS: BottomTabNavigationOptions = {
  title: "Settings",
  tabBarIcon: tabIcon("settings", "settings-outline"),
};

/*
 * The + slot. tabBarButton replaces the whole button the bar would draw for
 * this route. The props the bar hands over — its onPress included — are
 * ignored on purpose: the default onPress would switch to the `add` route,
 * and this button never navigates. See AddTabButton.
 */
const ADD_OPTIONS: BottomTabNavigationOptions = {
  title: "Add expense",
  tabBarButton: () => <AddTabButton />,
};

/*
 * Tap feedback for the + circle: Android ripples, iOS dims.
 *
 * One per scheme, because the ripple is picked by the CIRCLE and the circle
 * flips: white in dark mode, black in light. So a dark ripple in dark and a
 * light ripple in light — the exact inverse of the hero card's +, which is
 * why rippleOnBarAdd exists separately from rippleOnAdd.
 *
 * Built at module load, so android_ripple gets the same object every render.
 */
const RIPPLES: Record<Scheme, { color: string }> = {
  dark: { color: DARK.rippleOnBarAdd },
  light: { color: LIGHT.rippleOnBarAdd },
};

/*
 * The + in the middle of the bar. YOURS TO RESTYLE: the size and colours.
 *
 * It only asks for the add sheet. It never navigates, so the tab you were on
 * stays underneath the sheet, and the `add` route is never shown.
 *
 * The bar wraps every item, this one included, in a view with flex: 1
 * (BottomTabBar.tsx, styles.bottomItem), so all five slots are the same
 * width. That is what puts the circle in the true middle. addSlot fills that
 * view and centres the circle in it.
 *
 * overflow: hidden keeps the Android ripple inside the circle. It would also
 * clip a shadow on iOS, but the circle has none.
 */
function AddTabButton() {
  /*
   * The scheme is read HERE, in the leaf, not in TabsLayout.
   *
   * useColorScheme re-renders whichever component calls it. This button is
   * four elements; TabsLayout wraps the whole navigator and the add sheet.
   * Same reason ThemedStatusBar in app/_layout.tsx is its own component.
   */
  const scheme = schemeOf(useColorScheme());
  const c = PALETTES[scheme];
  const styles = STYLES[scheme];

  return (
    <View style={styles.addSlot}>
      <Pressable
        /*
         * key={scheme} FORCES A FRESH BUTTON WHEN THE THEME CHANGES, and it
         * is here because of what a reload does.
         *
         * The symptom: after a reload the + is correct. Toggle the theme once
         * and it goes wrong, and it STAYS wrong when you toggle back. Another
         * reload fixes it again. Meanwhile the dev line proves the values are
         * right every time — scheme light, circle #000000, glyph #FFFFFF.
         *
         * Correct on a fresh mount, wrong on an update, and sticky until the
         * next fresh mount. That is a native view holding something it was
         * given when it was created and not taking the new value on an
         * update. React is doing its job; the view underneath is not.
         *
         * The suspect is android_ripple. On Android it becomes the view's
         * background DRAWABLE, which is a native object rather than a style
         * value, and RIPPLES[scheme] hands the Pressable a different one on
         * every toggle. A key is the cheapest answer: React throws the old
         * view away and builds a new one, which is exactly what a reload was
         * doing by hand.
         *
         * It costs one button, four elements, on an event that happens when a
         * person changes a system setting.
         */
        key={scheme}
        accessibilityRole="button"
        accessibilityLabel="Add expense"
        android_ripple={RIPPLES[scheme]}
        style={({ pressed }) => [
          styles.addCircle,
          Platform.OS === "ios" && pressed ? styles.iosPressed : null,
        ]}
        onPress={requestAddSheet}
      >
        <Ionicons name="add" size={26} color={c.barAddIcon} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  /* Only used to choose between the two finished options objects. */
  const scheme = schemeOf(useColorScheme());

  const [addOpen, setAddOpen] = useState(false);

  /*
   * The title the sheet should open with, or null for an empty form.
   *
   * Written in the same handler as setAddOpen, so React applies both in one
   * render and the form mounts already knowing. It is overwritten on every
   * open, so a title left behind by an earlier one cannot leak into the next.
   */
  const [prefillTitle, setPrefillTitle] = useState<string | null>(null);

  /*
   * Opens the sheet when either + asks. The layout never unmounts, so this
   * listens for the life of the app.
   *
   * The title is read HERE, the moment a + is pressed, rather than handed
   * over by whoever pressed it. Neither button knows what is on screen: the
   * tab bar's is drawn by the navigator, and Home's sits inside a screen.
   * The page in front registers itself instead, and this asks.
   *
   * Returning the unsubscribe makes it this effect's cleanup. A hot update
   * re-runs effects, and runs the cleanup first, so there is never a second
   * listener opening the sheet twice.
   */
  useEffect(
    () =>
      onAddSheetRequested(() => {
        setPrefillTitle(addSheetTitle());
        setAddOpen(true);
      }),
    [],
  );

  /*
   * The add write.
   *
   * Nothing re-reads here. insertExpense bumps the expense change counter
   * after the write succeeds, and the list screen that is in front hears
   * that and re-reads itself. This layout owns no list, so it has nothing
   * of its own to refresh.
   */
  const addExpense = (
    title: string,
    amountMinor: Minor,
    currency: string,
    categoryId: string,
  ) => {
    insertExpense(title, amountMinor, currency, categoryId);
    setAddOpen(false);
  };

  return (
    <>
      {/* The order of the screens here is the order in the bar. */}
      <Tabs screenOptions={TAB_OPTIONS[scheme]}>
        <Tabs.Screen name="(home)" options={HOME_OPTIONS} />
        <Tabs.Screen name="(all)" options={ALL_OPTIONS} />
        <Tabs.Screen name="add" options={ADD_OPTIONS} />
        <Tabs.Screen name="(categories)" options={CATEGORIES_OPTIONS} />
        <Tabs.Screen name="settings" options={SETTINGS_OPTIONS} />
      </Tabs>

      {/* A Modal, so where it sits in this tree does not matter for layout:
          it draws in its own window, above the tabs and the tab bar.

          ExpenseForm unmounts whenever the Modal hides, so every open is a
          fresh form, and initialTitle is read fresh with it. */}
      <BottomSheet
        visible={addOpen}
        title="New expense"
        onClose={() => setAddOpen(false)}
      >
        <ExpenseForm
          initial={null}
          initialTitle={prefillTitle}
          submitLabel="Add expense"
          onSubmit={addExpense}
        />
      </BottomSheet>
    </>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    addSlot: { flex: 1, alignItems: "center", justifyContent: "center" },
    /*
     * YOURS TO RESTYLE — the + circle. It is whatever the bar is not: white
     * on the black bar, black on the light one.
     *
     * Light had no second option. A white circle on the #F2F2F7 bar reads
     * 1.12 — it would simply not be there. Black on it reads 18.82, and it
     * matches the hero card, which is also black in light mode.
     */
    addCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.barAddBg,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    // iOS only. Android shows its ripple instead.
    iosPressed: { opacity: 0.6 },
  });

const STYLES: Record<Scheme, ReturnType<typeof makeStyles>> = {
  dark: makeStyles(DARK),
  light: makeStyles(LIGHT),
};