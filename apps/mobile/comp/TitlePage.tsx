import { holdAddSheetTitle } from "@/comp/addSheet";
import ExpenseListScreen from "@/comp/ExpenseListScreen";
import { readExpenseTitle } from "@/db/expenses";
import { DARK, LIGHT, schemeOf, type Palette, type Scheme } from "@/theme/palette";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/*
 * The body of the title page: /title/<an expense's id>.
 *
 * It lives in comp/ rather than in app/ because TWO routes render it, one in
 * each tab's stack. Two copies of this file would drift apart; one copy behind
 * two one-line routes cannot.
 *
 * Each of those routes sits inside its tab's own stack, so the page is pushed
 * INSIDE that tab. The tab bar stays on screen, which is what gives this page
 * a + at all.
 *
 * The page itself is the list screen Home and All use, in title mode: the same
 * card, the same swipe Edit and Delete, the same Undo. This file only turns the
 * id into a title.
 *
 * NO StatusBar HERE ANY MORE. There is exactly one in the app, ThemedStatusBar
 * at the root in app/_layout.tsx. React Native's StatusBar is a
 * last-mounted-wins stack, and this page lives inside a tab's stack, so once
 * its gone screen had mounted its bar would have gone on winning after you
 * left the page — light icons on a light screen.
 */
export default function TitlePage() {
  /*
   * useLocalSearchParams is typed by the generic below, not checked when the
   * app runs. So the typeof makes sure only a string reaches the read.
   */
  const { id } = useLocalSearchParams<{ id: string }>();

  /*
   * The phone's light/dark setting, for the gone screen below.
   *
   * Above the early return, like the hook below it: a hook cannot run
   * conditionally. It costs nothing on the normal path — this component
   * renders three elements and then hands over to the list screen, which
   * reads the scheme itself.
   */
  const styles = STYLES[schemeOf(useColorScheme())];

  /*
   * Read once, from the tapped expense. The title the page shows never
   * changes for its life, even if that very expense is renamed or deleted
   * on the page: the page goes on answering "which expenses are called
   * this?".
   */
  const [title] = useState(() =>
    typeof id === "string" ? readExpenseTitle(id) : null,
  );

  /*
   * While this page is the one in front, the tab bar's + fills this title in.
   *
   * useFocusEffect rather than useEffect, because a title page stays mounted
   * when you switch tab. Two of them can be mounted at once, one per stack,
   * and only the focused one should be answering. The cleanup runs on blur, so
   * leaving the page hands the + back to an empty form.
   *
   * The add sheet is a Modal — its own window, but the same React tree — so
   * opening it does not blur this page and the title stays held.
   *
   * Nothing is returned when there is no title, rather than null:
   * useFocusEffect warns in development on any return value but a function or
   * undefined.
   *
   * Above the early return on purpose. A hook cannot run conditionally.
   */
  useFocusEffect(
    useCallback(() => {
      if (title === null) return;
      return holdAddSheetTitle(title);
    }, [title]),
  );

  if (title === null) {
    /* The expense was deleted before the page could read it. */
    return (
      <SafeAreaView style={styles.screen} edges={SAFE_EDGES}>
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
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>This expense is gone😥</Text>
          <Text style={styles.emptyBody}>
            It was deleted. Go back and pick another.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return <ExpenseListScreen screen="title" showTopCard titleOnly={title} />;
}

/*
 * No "bottom". SafeAreaView pads by its provider's insets, not by where the
 * view sits, and the tab bar already pads the bottom of everything inside the
 * tabs. Keeping "bottom" here would stack a second gap on top of the bar's.
 *
 * The list screen padded FOUR here until Session 35, on a comment saying this
 * page "opens over the tabs". That stopped being true at Session 29, when the
 * page moved inside the tab's own stack. Both files now pad three.
 */
const SAFE_EDGES = ["top", "left", "right"] as const;

/* YOURS TO RESTYLE — everything but the colours, which come from
 * theme/palette.ts. The same tokens the list screen's bar and empty text use,
 * so the gone page looks like the rest of the app in both modes. */
const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.page },
    bar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
    },
    barBack: {
      color: c.text,
      fontSize: 30,
      fontWeight: "300",
      marginTop: -6,
    },
    empty: { flex: 1, alignItems: "center", justifyContent: "center" },
    emptyTitle: { color: c.text, fontSize: 17, fontWeight: "600" },
    emptyBody: { color: c.textDim, fontSize: 14, marginTop: 6 },
  });

const STYLES: Record<Scheme, ReturnType<typeof makeStyles>> = {
  dark: makeStyles(DARK),
  light: makeStyles(LIGHT),
};