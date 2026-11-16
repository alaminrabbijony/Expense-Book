import type { useColorScheme } from "react-native";

/*
 * The app's two colour sets. YOURS TO RESTYLE — every value here.
 *
 * Every screen reads its colours from one of these two objects instead of
 * typing hex values into its own StyleSheet. That is what makes light and
 * dark mode one change here, not one change per screen.
 *
 * Both palettes must have exactly the same keys. The Palette type below is
 * what enforces it: a key added to one and forgotten in the other is a type
 * error, not a surface that silently stays dark in light mode.
 *
 * THE DARK VALUES ARE TODAY'S VALUES, EXACTLY. Nothing here changes how the
 * app looks right now. Every one was read back out of the screen it came
 * from, so switching a screen over to the palette is a swap, not a restyle.
 *
 * THE TWO SETS ARE NOT TWO SETS OF TASTE. The app is two-tone: a page, with
 * cards lifted just barely off it, and one card that deliberately contrasts.
 * Light mode swaps which end is which, so each role keeps roughly the
 * contrast it already has rather than being chosen again.
 *
 * IN BOTH MODES THE CARD IS LIFTED TOWARD THE LIGHT. Dark: a #1C1C1E card on
 * a black page. Light: a #FFFFFF card on a #F2F2F7 page. The first draft had
 * light the other way round — a grey card on a white page — which made the
 * card sink while its dark twin rose. Same 1.12 separation either way, so the
 * arithmetic did not catch it; the structure did.
 *
 * Computed against the surface each one actually sits on:
 *
 *                    dark   on card      light   on card
 *     text         #ECEDEE    14.52    #1C1C1E    17.01
 *     textStrong   #FFFFFF    17.01    #000000    21.00
 *     textDim      #8A8F98     5.24    #6E6E73     5.07
 *     placeholder  #8E8E93     5.22    #636366     5.99
 *     dangerInk    #E5484D     4.35    #C62B30     5.54
 *     card on page             1.23               1.12
 *
 * Two of the light values are already in this app. #1C1C1E is today's card
 * colour doing the opposite job. #C62B30 is the red Session 32 chose for the
 * category page's rename error, which sits on a white card where #E5484D
 * reads only 3.51.
 */
export type Palette = {
  /** The screen behind everything. */
  page: string;

  /** The top card, and what sits on it. */
  heroBg: string;
  /** The total and the ⋯ icon. */
  heroInk: string;
  /** "SPENT RECENTLY", or the filter's name. */
  heroLabel: string;
  /** The circle behind ⋯. */
  heroIconBg: string;
  /** The round + and its icon. The one surface that contrasts with the card. */
  addBg: string;
  addIcon: string;
  /**
   * The prompt inside the rename field on the hero card.
   *
   * NOT `placeholder`. That one sits on `card`, which is dark in dark mode
   * and light in light mode. This one sits on `heroIconBg`, which runs the
   * other way, so the two hold different values in each mode. #8E8E93 is
   * the one grey that clears 3.00 on BOTH of those surfaces — 2.92 on the
   * pale field and 4.27 on the dark one.
   *
   * The 2.92 is today's value and today's weakness, kept so dark mode does
   * not move. #636366 would read 5.37 there and 2.33 in light mode, so it
   * is not a straight swap.
   */
  heroPlaceholder: string;
  /**
   * Error text ON the hero card — the rename error.
   *
   * `dangerInk` exactly inverted, because the hero card is the one surface
   * that inverts: #C62B30 reads 5.54 on dark's white card, #E5484D reads
   * 5.37 on light's black one. Using `dangerInk` here would pick the value
   * meant for the opposite surface.
   */
  heroDangerInk: string;
  /**
   * The veil over the 124 icon circle while the card is being edited.
   *
   * Black in BOTH modes, which is not laziness. Black over the pale light
   * tints leaves the worst glyph at 3.24, against 2.41 in dark; a white
   * veil was computed at 2.41 light and 2.02 dark, worse in both.
   */
  heroCircleScrim: string;
  /**
   * The disc the edit pencil sits on, inside that circle.
   *
   * The same in both modes: white on it reads 18.16 over the worst dark
   * circle and 9.11 over the worst light one, both through the veil above.
   */
  pencilDiscBg: string;

  /*
   * The + in the middle of the TAB BAR, which is a different button on a
   * different surface from the one above.
   *
   * The hero's + contrasts with the hero card. This one contrasts with the
   * bar, and the bar uses `page` — so the two pairs are opposites of each
   * other in each mode, and neither can borrow the other's values.
   *
   * Light has no choice here: a white circle on the #F2F2F7 bar reads 1.12
   * and is invisible. Black on it reads 18.82, and matches the hero card,
   * which is also black in light mode.
   */
  barAddBg: string;
  barAddIcon: string;

  /** Expense cards, category rows, the Add pill, dialogs, the undo row. */
  card: string;
  /**
   * The period menu's own surface — a small box that floats over the card.
   *
   * Not `card`: it has to read as RAISED above whatever it covers, which in
   * dark means lighter than the card below it. In light it is #FFFFFF, only
   * 1.12 off the page, and its `elevation: 8` shadow is what separates it —
   * the same job dark's 1.51 does. Its text is `textStrong`: 13.94 dark,
   * 21.00 light, so the menu needs no ink token of its own.
   */
  menuBg: string;

  /** Titles, amounts, names, the empty screen's heading. */
  text: string;
  /** A screen's own title, and a dialog's. Brighter than `text`. */
  textStrong: string;
  /** Date lines, struck-through text, secondary body copy, hints. */
  textDim: string;
  /** Text a field shows while it is empty. Not content — a prompt. */
  placeholder: string;

  /**
   * A destructive FILL: the Add knob, the dialog's Delete button.
   *
   * The same in both modes, and that is not laziness. A fill does not care
   * what page it is on — only that `onDanger` reads on top of it, which is
   * 3.91 either way.
   */
  danger: string;
  /**
   * Destructive or error TEXT, sitting on `card` or `page`.
   *
   * A separate token because the two pull opposite ways. #E5484D reads 4.35
   * on the dark card and only 3.51 on the light one; #C62B30 reads 4.97 on
   * the light card and only 3.07 on the dark one. One value cannot do both.
   */
  dangerInk: string;
  /**
   * What sits on a dark fill: the `danger` button, both swipe blocks, and
   * the edit pencil's disc. #FFFFFF in both modes, for the same reason
   * `danger` is — a fill does not care what page it is on.
   */
  onDanger: string;

  /**
   * The two blocks revealed behind a swiped expense row.
   *
   * FILLS, so both are the same in both modes, like `danger`. `onDanger`
   * on them reads 5.99 and 3.41, unchanged either way.
   *
   * swipeDelete is #FF453A and `danger` is #E5484D — two different reds
   * doing the same job, from two different sessions. They are deliberately
   * NOT merged here, because merging them would change how dark mode looks.
   */
  swipeEdit: string;
  swipeDelete: string;

  /**
   * A faint separator: the line above the tab bar, and the one on the add
   * sheet's top edge.
   *
   * Barely visible on purpose — 1.51 against the dark page and 1.53 against
   * the light one. It exists to give an edge a shape, not to draw attention.
   * The app also has a STRONGER line, #636366, used between rows in the
   * period menu and the category picker. That one is a different role and
   * gets its own token when those files are converted.
   */
  line: string;
  /**
   * The LOUD separator, meant to be read rather than felt: the 1dp line
   * between the period menu's rows, and the category picker's row divider.
   *
   * The second of the two line roles the app has always had, and the one
   * `line`'s comment said would get its own token when these files were
   * converted. Matched by feel, not by hex: #636366 on dark's #2C2C2E menu
   * reads 2.33, and #A8A8AD on light's #FFFFFF menu reads 2.37.
   *
   * Only the period menu uses it today. comp/CategoryLListItem.tsx is the
   * second caller and is not themed yet.
   */
  lineStrong: string;

  /** A modal's backdrop. Over a light page it becomes #616163, and a #FFFFFF
   *  dialog on that reads 6.18 — so it works unchanged in both modes. */
  scrim: string;

  /*
   * How far a row recedes while another row is being edited.
   *
   * A NUMBER, and the only non-colour here, because opacity is a colour
   * decision wearing a different type. It blends the row's card AND its text
   * toward the PAGE, so one value cannot serve both themes.
   *
   * Dark: 0.40 leaves a row's text reading 3.07 against its own card. 0.35
   * gives 2.57, which was rejected as unreadable.
   *
   * Light: the same 0.40 gives 2.56 — almost exactly that rejected number.
   * 0.47 gives 3.12, the nearest match to dark's 3.07. Not a round number,
   * for the same reason 0.40 is not 0.5: it was computed, not picked.
   */
  dimOpacity: number;

  /*
   * Android ripples. Picked by the colour BEHIND the control, never by the
   * control: a white ripple on a white surface is invisible, and the tap
   * looks like it did nothing.
   */
  /** On the page. */
  rippleOnPage: string;
  /** On the top card (the ⋯ button). */
  rippleOnHero: string;
  /** On the round +. */
  rippleOnAdd: string;
  /** On a card: a category row's name, and its icon circle while editing. */
  rippleOnCard: string;
  /**
   * On the tab bar's + circle.
   *
   * The exact inverse of rippleOnAdd, because the two circles are opposites:
   * the hero's + is dark on a light card in dark mode, and this one is light
   * on a dark bar. Using rippleOnAdd here would put a light ripple on a white
   * circle, which is a tap that looks like it did nothing.
   */
  rippleOnBarAdd: string;

  /** The clock and battery icons, drawn on `page`. */
  statusBar: "light-content" | "dark-content";
};

/* What the app has looked like so far. */
export const DARK: Palette = {
  page: "#000000",
  heroBg: "#FFFFFF",
  heroInk: "#1C1C1E",
  heroLabel: "#6E6E73",
  heroIconBg: "#F2F2F7",
  addBg: "#000000",
  addIcon: "#FFFFFF",
  heroPlaceholder: "#8E8E93",
  heroDangerInk: "#C62B30",
  heroCircleScrim: "rgba(0,0,0,0.30)",
  pencilDiscBg: "rgba(0,0,0,0.55)",
  barAddBg: "#FFFFFF",
  barAddIcon: "#000000",
  card: "#1C1C1E",
  menuBg: "#2C2C2E",
  text: "#ECEDEE",
  textStrong: "#FFFFFF",
  textDim: "#8A8F98",
  placeholder: "#8E8E93",
  danger: "#E5484D",
  dangerInk: "#E5484D",
  onDanger: "#FFFFFF",
  swipeEdit: "#636366",
  swipeDelete: "#FF453A",
  line: "#2C2C2E",
  lineStrong: "#636366",
  scrim: "rgba(0,0,0,0.6)",
  dimOpacity: 0.4,
  rippleOnPage: "rgba(255,255,255,0.22)",
  rippleOnHero: "rgba(0,0,0,0.12)",
  rippleOnAdd: "rgba(255,255,255,0.22)",
  rippleOnCard: "rgba(255,255,255,0.12)",
  rippleOnBarAdd: "rgba(0,0,0,0.12)",
  statusBar: "light-content",
};

/* The reference design: white page, black top card, light grey cards. */
export const LIGHT: Palette = {
  page: "#F2F2F7",
  heroBg: "#000000",
  heroInk: "#FFFFFF",
  heroLabel: "#AEAEB2",
  heroIconBg: "#2C2C2E",
  addBg: "#FFFFFF",
  addIcon: "#000000",
  heroPlaceholder: "#8E8E93",
  heroDangerInk: "#E5484D",
  heroCircleScrim: "rgba(0,0,0,0.30)",
  pencilDiscBg: "rgba(0,0,0,0.55)",
  barAddBg: "#000000",
  barAddIcon: "#FFFFFF",
  card: "#FFFFFF",
  menuBg: "#FFFFFF",
  text: "#1C1C1E",
  textStrong: "#000000",
  textDim: "#6E6E73",
  placeholder: "#636366",
  danger: "#E5484D",
  dangerInk: "#C62B30",
  onDanger: "#FFFFFF",
  swipeEdit: "#636366",
  swipeDelete: "#FF453A",
  line: "#C6C6C8",
  lineStrong: "#A8A8AD",
  scrim: "rgba(0,0,0,0.6)",
  dimOpacity: 0.47,
  rippleOnPage: "rgba(0,0,0,0.12)",
  rippleOnHero: "rgba(255,255,255,0.22)",
  rippleOnAdd: "rgba(0,0,0,0.12)",
  rippleOnCard: "rgba(0,0,0,0.12)",
  rippleOnBarAdd: "rgba(255,255,255,0.22)",
  statusBar: "dark-content",
};

export type Scheme = "light" | "dark";

export const PALETTES: Record<Scheme, Palette> = { light: LIGHT, dark: DARK };

/*
 * Turns what the phone reports into one of the two palettes' names.
 *
 * useColorScheme() can also return null or undefined — before the native
 * side has answered, or on a platform that has no setting. Those fall back
 * to dark, because dark is what the app has always been.
 */
export function schemeOf(raw: ReturnType<typeof useColorScheme>): Scheme {
  return raw === "light" ? "light" : "dark";
}