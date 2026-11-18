import { useState } from "react";
import { Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PALETTES, schemeOf, type Palette, type Scheme } from "@/theme/palette";
import {
  getThemeChoice,
  setThemeChoice,
  THEME_CHOICES,
  type ThemeChoice,
} from "@/theme/themeChoice";

/*
 * Which edges the SafeAreaView pads. Not the bottom: the tab bar below this
 * screen already pads for the system navigation bar, and SafeAreaView pads
 * by the whole window's insets, not its own position. The full reason is
 * at SAFE_EDGES in comp/ExpenseListScreen.tsx.
 */
const SAFE_EDGES = ["top", "left", "right"] as const;

/*
 * What each segment says. YOURS TO RESTYLE — the words included.
 *
 * A Record keyed by ThemeChoice, so a fourth choice added to
 * theme/themeChoice.ts is a type error here until it has a label, instead
 * of a segment with no text.
 */
const LABELS: Record<ThemeChoice, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export default function Settings() {
  /*
   * Its own hook, not a prop: this screen owns every surface it draws on,
   * out to the page. Session 36's rule — a component that cannot end up
   * disagreeing with a surface it does not own may read the scheme itself.
   */
  const scheme = schemeOf(useColorScheme());
  const styles = STYLES[scheme];

  /*
   * Which segment is highlighted.
   *
   * getThemeChoice is passed as the FUNCTION, not called: useState runs it
   * once, before the first render, so the very first frame already
   * highlights the saved choice. Read in an effect instead, the screen would
   * open on "System" for one frame and then jump. Same shape as the 6a
   * initialisers.
   *
   * Local state is enough, with no listener, because THIS SCREEN IS THE
   * ONLY WRITER. The phone switching dark/light changes the scheme, not the
   * choice: "System" stays "System".
   */
  const [picked, setPicked] = useState<ThemeChoice>(getThemeChoice);

  function pick(choice: ThemeChoice) {
    try {
      // Save-and-apply FIRST. It can throw (the key-value file failing to
      // write), and if it does the highlight must not move to a choice that
      // was never saved — the next launch would quietly undo it.
      setThemeChoice(choice);
      setPicked(choice);
    } catch (e: unknown) {
      if (__DEV__) console.warn(`theme: could not save "${choice}"`, e);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={SAFE_EDGES}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Appearance</Text>

        {/*
          The segmented control. The track is one card; the picked segment is
          an inverted pill on it.

          NO android_ripple on the segments, deliberately. A segment's
          background changes every time the selection moves, and Session 35
          proved android_ripple bakes the background into a native drawable
          when the view is created — after which a colour change does not
          repaint. The highlight would likely stay on the old segment with
          nothing thrown. Tap feedback comes from the `pressed` style instead,
          which is a plain style value and cannot go stale.
        */}
        <View style={styles.track} accessibilityRole="radiogroup">
          {THEME_CHOICES.map((choice) => {
            const on = choice === picked;
            return (
              <Pressable
                key={choice}
                onPress={() => pick(choice)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={({ pressed }) => [
                  styles.segment,
                  on && styles.segmentOn,
                  // Only the unpicked ones fade: pressing the picked segment
                  // does nothing (setThemeChoice returns early), so it should
                  // not look like it did something.
                  pressed && !on && styles.segmentPressed,
                ]}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
                  {LABELS[choice]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

// YOURS TO RESTYLE — every size and spacing. The colours come from the
// palette; change those in theme/palette.ts, not here.
function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.page },
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
    /*
     * textStrong is #FFFFFF in dark — exactly what this title was before it
     * was themed — so dark mode does not move.
     */
    title: { color: c.textStrong, fontSize: 20, fontWeight: "700" },

    section: { paddingHorizontal: 20, paddingTop: 8 },
    /*
     * textDim on the light page reads 4.54 against a 4.5 floor. This makes
     * it the FOURTH label on that tripwire, after BottomSheet's title,
     * CategorySheet's counts and IconPicker's empty state. Darken `page` and
     * this fails with them.
     */
    sectionLabel: {
      color: c.textDim,
      fontSize: 13,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      paddingBottom: 8,
    },

    /*
     * The track is `card`: 1.23 off the page in dark, 1.12 in light — the
     * same lift every card in the app has.
     */
    track: {
      flexDirection: "row",
      backgroundColor: c.card,
      borderRadius: 10,
      padding: 3,
    },
    segment: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 8,
      borderRadius: 8,
    },
    // 14.52 against the track in dark, 17.01 in light.
    segmentOn: { backgroundColor: c.selectedBg },
    segmentPressed: { opacity: 0.6 },
    // Unpicked words: textDim on the card track, 5.24 dark / 5.07 light.
    segmentText: { color: c.textDim, fontSize: 14, fontWeight: "600" },
    // 14.52 on selectedBg in dark, 17.01 in light.
    segmentTextOn: { color: c.selectedInk },
  });
}

/*
 * Built twice at module load, once per palette — the shape every themed file
 * in this project uses.
 */
const STYLES: Record<Scheme, ReturnType<typeof makeStyles>> = {
  dark: makeStyles(PALETTES.dark),
  light: makeStyles(PALETTES.light),
};