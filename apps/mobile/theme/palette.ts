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

  /** Expense cards and the undo row. */
  card: string;
  /** The circle behind each card's category icon. */
  iconCircle: string;
  /** Titles, amounts, the card icon, the empty screen's heading. */
  text: string;
  /** Date lines, the undo row's crossed-out text, the footer, hints. */
  textDim: string;
  /** Undo and Show all. The same in both modes. */
  danger: string;

  /*
   * Android ripples. Picked by the colour BEHIND the control, never by the
   * control: a white ripple on a white surface is invisible, and the tap
   * looks like it did nothing.
   */
  /** On the page or on a card. */
  rippleOnPage: string;
  /** On the top card (the ⋯ button). */
  rippleOnHero: string;
  /** On the round +. */
  rippleOnAdd: string;

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
  card: "#1C1C1E",
  iconCircle: "#2C2C2E",
  text: "#ECEDEE",
  textDim: "#8A8F98",
  danger: "#E5484D",
  rippleOnPage: "rgba(255,255,255,0.22)",
  rippleOnHero: "rgba(0,0,0,0.12)",
  rippleOnAdd: "rgba(255,255,255,0.22)",
  statusBar: "light-content",
};

/* The reference design: white page, black top card, light grey cards. */
export const LIGHT: Palette = {
  page: "#FFFFFF",
  heroBg: "#000000",
  heroInk: "#FFFFFF",
  heroLabel: "#AEAEB2",
  heroIconBg: "#2C2C2E",
  addBg: "#FFFFFF",
  addIcon: "#000000",
  card: "#F2F2F7",
  iconCircle: "#E5E5EA",
  text: "#1C1C1E",
  textDim: "#6E6E73",
  danger: "#E5484D",
  rippleOnPage: "rgba(0,0,0,0.12)",
  rippleOnHero: "rgba(255,255,255,0.22)",
  rippleOnAdd: "rgba(0,0,0,0.12)",
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