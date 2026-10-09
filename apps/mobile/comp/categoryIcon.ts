import Ionicons from "@expo/vector-icons/Ionicons";
import type { CategoryIcons } from "@/db/expenses";

/*
 * Everything that decides what a category's icon looks like, in one place.
 *
 * It used to live at the top of comp/ExpenseListScreen.tsx, which was fine
 * while that screen was the only thing drawing an icon. The Categories tab
 * draws them too now, and a second copy of this palette could drift: the
 * same category would get one colour on Home and another on Categories,
 * with nothing to catch it.
 */

/*
 * The icon a card falls back to: a category with no icon chosen, and the
 * Uncategorised row, which is meant to look unsorted.
 */
export const DEFAULT_CATEGORY_ICON = "receipt-outline" as const;

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
export type IoniconName = keyof typeof IONICON_NAMES;

export const iconOrDefault = (name: string | undefined): IoniconName =>
  name && Object.prototype.hasOwnProperty.call(IONICON_NAMES, name)
    ? (name as IoniconName)
    : DEFAULT_CATEGORY_ICON;

/*
 * A one-line signature of the icon map. It does two jobs: deciding whether a
 * re-read actually changed anything, and telling the list that it did.
 *
 * Both come from the same object, so they cannot disagree — the same shape as
 * holdPeriod in comp/ExpenseListScreen.tsx writing its four values together.
 * Sorted, so the order rows come back in cannot change the signature by
 * itself.
 */
export const iconsSignature = (icons: CategoryIcons): string =>
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
export const PLACEHOLDER_SHADE = { color: "#ECEDEE", tint: "#2C2C2E" };

/*
 * Which colour a category gets.
 *
 * Worked out from its id rather than stored, so nothing needs a column or a
 * migration and every category has one from the moment it exists, hand-made
 * ones included. The same id always lands on the same colour, so a colour
 * never moves by itself.
 *
 * Once a picker exists to choose a colour, a stored one simply overrides this.
 */
export const shadeForCategory = (
  id: string,
): { color: string; tint: string } => {
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
export const iconFor = (
  categoryId: string | null,
  chosen: string | undefined,
): { name: IoniconName; color: string; tint: string } => {
  const shade =
    chosen && categoryId ? shadeForCategory(categoryId) : PLACEHOLDER_SHADE;
  return { name: iconOrDefault(chosen), color: shade.color, tint: shade.tint };
};

/*
 * The same thing for a row, with the name looked up in the map first.
 *
 * Split in two so the category page's big circle can show an icon that is
 * only being CONSIDERED — picked in the sheet, not yet saved — and still get
 * its colour, its circle and its fallback from exactly these rules. One set
 * of rules, so a card and a row cannot disagree about the same category.
 */
export const iconForRow = (
  categoryId: string | null,
  icons: CategoryIcons,
): { name: IoniconName; color: string; tint: string } =>
  iconFor(categoryId, categoryId ? icons[categoryId] : undefined);