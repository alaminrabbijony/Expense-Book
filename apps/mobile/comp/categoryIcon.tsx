import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { CategoryIcons } from "@/db/expenses";

/*
 * Everything that decides what a category's icon looks like, in one place.
 *
 * Two fonts now. Ionicons has 1,357 glyphs and no rickshaw, no mosque, no
 * rice, no tea, no pill; MaterialCommunityIcons has 7,448 and has all of
 * them. Both ship inside @expo/vector-icons 15.1.1, which was already
 * installed, so nothing was added and nothing was rebuilt.
 */

/* Which font a glyph belongs to. */
export type IconFamily = "ion" | "mci";

/*
 * HOW A FAMILY IS STORED, and the one rule that keeps old rows working.
 *
 * icon_name is a single TEXT column. A MaterialCommunityIcons glyph is
 * written with a prefix — "mci:rice" — and an Ionicons glyph is written
 * bare — "fast-food-outline".
 *
 * BARE MEANS IONICONS, PERMANENTLY. Every icon picked before today is a
 * bare Ionicons name, so this rule makes all of them correct as they stand:
 * no migration, no backfill, no rewriting rows. The cost is that the rule
 * lives here in the parsing rather than in the data, which is why it is
 * written out this loudly.
 */
const MCI_PREFIX = "mci:";

/*
 * Each font's own list of names, read from the font at module load.
 *
 * An icon name used to be written in code, so a typo was a type error. It
 * comes out of the database now, as plain text, and TypeScript cannot see
 * inside a database. An unknown name does not throw either: the font draws
 * a literal "?" and logs nothing. These maps are the guard.
 *
 * getRawGlyphMap is the typed way to ask a font what it has. Both fonts
 * come from the same createIconSet factory, so both have it. hasIcon()
 * exists in the JavaScript of each and is missing from the published
 * typings, so it does not compile.
 */
const IONICON_NAMES = Ionicons.getRawGlyphMap();
const MCI_NAMES = MaterialCommunityIcons.getRawGlyphMap();

type IoniconName = keyof typeof IONICON_NAMES;
type MciName = keyof typeof MCI_NAMES;

/*
 * The icon a card falls back to: a category with no icon chosen, and the
 * Uncategorised row, which is meant to look unsorted.
 */
export const DEFAULT_CATEGORY_ICON: { family: IconFamily; name: string } = {
  family: "ion",
  name: "receipt-outline",
};

const familyKnows = (family: IconFamily, name: string): boolean =>
  family === "mci"
    ? Object.prototype.hasOwnProperty.call(MCI_NAMES, name)
    : Object.prototype.hasOwnProperty.call(IONICON_NAMES, name);

/*
 * A stored string to a font and a glyph. The inverse of encodeIcon below.
 */
export const parseIcon = (
  stored: string,
): { family: IconFamily; name: string } =>
  stored.startsWith(MCI_PREFIX)
    ? { family: "mci", name: stored.slice(MCI_PREFIX.length) }
    : { family: "ion", name: stored };

/*
 * A font and a glyph to the string that goes in the database.
 *
 * THE PICKER MUST CALL THIS. Handing back a bare MaterialCommunityIcons
 * name stores something that reads back as an Ionicons name, finds no
 * glyph, and quietly draws the grey receipt — which looks exactly like an
 * icon that failed to save.
 */
export const encodeIcon = (family: IconFamily, name: string): string =>
  family === "mci" ? MCI_PREFIX + name : name;

/*
 * Every glyph the picker can offer, already encoded, sorted.
 *
 * Built from the fonts themselves at module load, not from a hand-written
 * list: nothing to update when the package moves, and a value that reaches
 * the database is one a font can definitely draw, by construction.
 */
export const ALL_ICON_VALUES: string[] = [
  ...Object.keys(IONICON_NAMES).map((n) => encodeIcon("ion", n)),
  ...Object.keys(MCI_NAMES).map((n) => encodeIcon("mci", n)),
].sort();

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
 * Everything one card needs to draw its icon: which font, which glyph, the
 * glyph's colour, and the circle behind it.
 *
 * FOUR PLAIN STRINGS, never one object. ExpenseRow is memo'd and compares
 * each prop with Object.is, so an object built here would be a new value on
 * every render and no row would ever skip one.
 *
 * The colour follows whether an icon was SET, not whether a font knew the
 * name. A category whose stored glyph no font can draw still gets its
 * colour; a category with no icon at all stays grey.
 */
export type ResolvedIcon = {
  family: IconFamily;
  name: string;
  color: string;
  tint: string;
};

export const iconFor = (
  categoryId: string | null,
  chosen: string | undefined,
): ResolvedIcon => {
  const shade =
    chosen && categoryId ? shadeForCategory(categoryId) : PLACEHOLDER_SHADE;
  const parsed = chosen ? parseIcon(chosen) : null;
  const glyph =
    parsed && familyKnows(parsed.family, parsed.name)
      ? parsed
      : DEFAULT_CATEGORY_ICON;
  return {
    family: glyph.family,
    name: glyph.name,
    color: shade.color,
    tint: shade.tint,
  };
};

/*
 * The same thing for a row, with the stored value looked up in the map first.
 *
 * Split in two so a picker can show an icon that is only being CONSIDERED —
 * picked in the sheet, not yet saved — and still get its colour, its circle
 * and its fallback from exactly these rules. One set of rules, so a card and
 * a row cannot disagree about the same category.
 */
export const iconForRow = (
  categoryId: string | null,
  icons: CategoryIcons,
): ResolvedIcon =>
  iconFor(categoryId, categoryId ? icons[categoryId] : undefined);

/*
 * Draws a glyph from whichever font it belongs to.
 *
 * This is the only place in the app that names a font. Every screen asks
 * iconFor or iconForRow for a family and hands it here, so adding a third
 * font later is one more branch in one file rather than an edit in four
 * screens.
 *
 * The casts are safe and they are not laziness: `name` came out of the
 * database as plain text, and the real check already happened in iconFor,
 * which falls back to the placeholder unless the font's own glyph map has
 * the name. The cast is how that fact is told to TypeScript, which cannot
 * see inside a database.
 */
export function CategoryGlyph({
  family,
  name,
  size,
  color,
}: {
  family: IconFamily;
  name: string;
  size: number;
  color: string;
}) {
  return family === "mci" ? (
    <MaterialCommunityIcons
      name={name as MciName}
      size={size}
      color={color}
    />
  ) : (
    <Ionicons name={name as IoniconName} size={size} color={color} />
  );
}