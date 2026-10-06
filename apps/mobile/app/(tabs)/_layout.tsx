import { onAddSheetRequested, requestAddSheet } from "@/comp/addSheet";
import BottomSheet from "@/comp/BottomSheet";
import ExpenseForm from "@/comp/ExpenseForm";
import { insertExpense } from "@/db/expenses";
import type { Minor } from "@et/shared";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import { type ComponentProps, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

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
const TAB_OPTIONS: BottomTabNavigationOptions = {
  headerShown: false,
  tabBarActiveTintColor: "#FFFFFF",
  tabBarInactiveTintColor: "#8A8F98",
  tabBarStyle: { backgroundColor: "#000000", borderTopColor: "#2C2C2E" },
  sceneStyle: { backgroundColor: "#000000" },
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
 * Tap feedback for the white circle: Android ripples, iOS dims. The ripple
 * is the DARK one because what is directly behind it is white — the same
 * rule as the top card's buttons.
 */
const RIPPLE_ON_WHITE = { color: "rgba(0,0,0,0.12)" };

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
  return (
    <View style={styles.addSlot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add expense"
        android_ripple={RIPPLE_ON_WHITE}
        style={({ pressed }) => [
          styles.addCircle,
          Platform.OS === "ios" && pressed ? styles.iosPressed : null,
        ]}
        onPress={requestAddSheet}
      >
        <Ionicons name="add" size={26} color="#000000" />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const [addOpen, setAddOpen] = useState(false);

  /*
   * Opens the sheet when either + asks. The layout never unmounts, so this
   * listens for the life of the app.
   *
   * Returning the unsubscribe makes it this effect's cleanup. A hot update
   * re-runs effects, and runs the cleanup first, so there is never a second
   * listener opening the sheet twice.
   */
  useEffect(() => onAddSheetRequested(() => setAddOpen(true)), []);

  /*
   * The add write.
   *
   * KNOWN ISSUE: NOTHING HAPPENS AFTER IT, and that is the point of this
   * step. insertExpense bumps the expense counter, but no list screen listens
   * yet, so no list on any tab shows the new expense until the app restarts.
   * That is the one write several screens have to hear about, with nobody
   * listening.
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
      <Tabs screenOptions={TAB_OPTIONS}>
                <Tabs.Screen name="(home)" options={HOME_OPTIONS} />
                <Tabs.Screen name="(all)" options={ALL_OPTIONS} />
        <Tabs.Screen name="add" options={ADD_OPTIONS} />
        <Tabs.Screen name="categories" options={CATEGORIES_OPTIONS} />
        <Tabs.Screen name="settings" options={SETTINGS_OPTIONS} />
      </Tabs>

      {/* A Modal, so where it sits in this tree does not matter for layout:
          it draws in its own window, above the tabs and the tab bar.

          ExpenseForm unmounts whenever the Modal hides, so every open is a
          fresh, empty form. */}
      <BottomSheet
        visible={addOpen}
        title="New expense"
        onClose={() => setAddOpen(false)}
      >
        <ExpenseForm
          initial={null}
          submitLabel="Add expense"
          onSubmit={addExpense}
        />
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  addSlot: { flex: 1, alignItems: "center", justifyContent: "center" },
  // YOURS TO RESTYLE — the + circle. White with a black +, the top card's +
  // flipped.
  addCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  // iOS only. Android shows its ripple instead.
  iosPressed: { opacity: 0.6 },
});
