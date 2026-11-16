import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { CategoryIcons } from "@/db/expenses";
import type { Scheme } from "@/theme/palette";

/*
 * Everything that decides what a category's icon looks like, in one place.
 *
 * Two fonts now. Ionicons has 1,357 glyphs and no rickshaw, no mosque, no
 * rice, no tea, no pill; MaterialCommunityIcons has 7,448 and has all of
 * them. Both ship inside @expo/vector-icons 15.1.1, which was already
 * installed, so nothing was added and nothing was rebuilt.
 *
 * TWO COLOUR SETS NOW TOO, and that is why every function here takes a
 * scheme. The glyph and circle colours are the one part of theming that a
 * palette of named surfaces cannot carry: there are twelve of them, they are
 * chosen by a hash rather than by a role, and they have to agree with each
 * other. They live here, beside the rules that use them.
 *
 * Type-only import of Scheme, so this file still has no runtime dependency on
 * theme/palette.ts and the two cannot form a cycle.
 */

/* Which font a glyph belongs to. */
export type IconFamily = "ion" | "mci";

/* A glyph's colour and the circle behind it. */
export type Shade = { color: string; tint: string };

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
 * Twelve colours for the category icons, each holding BOTH modes.
 *
 * ONE ARRAY, NOT TWO, and that is the whole reason this is shaped like this.
 * shadeForCategory hashes an id into a position in this array. Two separate
 * arrays could drift to different lengths, and a different length means the
 * same category lands on a different colour in light mode than in dark —
 * which nothing would throw about and nobody would spot until a screenshot.
 * One array has one length by construction.
 *
 * `color` is the glyph. `tint` is the circle behind it, worked out in advance
 * so no blending happens while a row draws.
 *
 * THE RULE IS THE SAME RULE IN BOTH MODES, INVERTED. The circle stays quiet
 * and the glyph carries the meaning. Dark: a bright glyph on a dark faint
 * disc, the glyph's own colour at 22% over the #1C1C1E card. Light: a dark
 * glyph on a pale faint disc, at 18% over the #FFFFFF card.
 *
 * The dark glyphs could NOT simply be reused on a light card. Seven of the
 * twelve fall below the 3.00 floor there — #FFD60A reads 1.27 and #FF9F0A
 * 1.84 — and a 22% tint of a bright colour over a light card is invisible
 * (1.07 to 1.31) with a glyph that cannot read on it (1.19 to 2.34). Each
 * light glyph is its dark hue darkened until it reads 4.5 on its own tint.
 *
 * Every pair was computed. Light: glyph on tint 4.96 to 5.13, tint on card
 * 1.30 to 1.35. Dark: glyph on tint 3.54 to 6.79, tint on card 1.14 to 1.35.
 * So light mode is the stronger set, and both keep the circle nearly silent.
 *
 * THE TINTS WERE COMPUTED TWICE. The first set sat on a #F2F2F7 card and read
 * 4.50 to 4.63. The card became #FFFFFF, so all twelve were recomputed rather
 * than carried across: a tint is 18% of its glyph over THE CARD, so it
 * outlives a change of card only by accident.
 *
 * iOS's indigo #5E5CE6 is NOT in the dark column: it read 2.75, under the
 * floor, and #7D7AFF replaces it at 4.05.
 */
const ICON_SHADES: Record<Scheme, Shade>[] = [
  {
    dark: { color: "#FF453A", tint: "#4E2524" },
    light: { color: "#AB2E27", tint: "#F0D9D8" },
  },
  {
    dark: { color: "#FF9F0A", tint: "#4E391A" },
    light: { color: "#825105", tint: "#E9E0D2" },
  },
  {
    dark: { color: "#FFD60A", tint: "#4E451A" },
    light: { color: "#6E5C04", tint: "#E5E2D2" },
  },
  {
    dark: { color: "#30D158", tint: "#20442B" },
    light: { color: "#186B2D", tint: "#D5E4D9" },
  },
  {
    dark: { color: "#66D4CF", tint: "#2C4445" },
    light: { color: "#316663", tint: "#DAE3E3" },
  },
  {
    dark: { color: "#40C8E0", tint: "#244249" },
    light: { color: "#216672", tint: "#D7E3E6" },
  },
  {
    dark: { color: "#64D2FF", tint: "#2C4450" },
    light: { color: "#2F6378", tint: "#DAE3E7" },
  },
  {
    dark: { color: "#0A84FF", tint: "#183350" },
    light: { color: "#075CB2", tint: "#D2E2F1" },
  },
  {
    dark: { color: "#7D7AFF", tint: "#313150" },
    light: { color: "#5553AD", tint: "#E0E0F0" },
  },
  {
    dark: { color: "#BF5AF2", tint: "#402A4D" },
    light: { color: "#823DA5", tint: "#E9DCEF" },
  },
  {
    dark: { color: "#FF375F", tint: "#4E222C" },
    light: { color: "#AD2541", tint: "#F0D8DD" },
  },
  {
    dark: { color: "#AC8E68", tint: "#3C352E" },
    light: { color: "#6E5B43", tint: "#E5E1DD" },
  },
];

/*
 * What a category with no icon shows: a quiet circle and a legible glyph.
 * Kept separate from the twelve on purpose. "Nobody has chosen an icon yet"
 * should not look like a choice someone made.
 *
 * Dark is exactly what the cards had before any of this: #ECEDEE on #2C2C2E,
 * a circle reading 1.22 against the card and a glyph reading 11.89 on it.
 *
 * Light had to be chosen, and the same restraint drove it: #E5E5EA reads 1.26
 * against the white card, the closest thing in the app to the dark circle's
 * 1.22, with a #6E6E73 glyph on it at 4.04.
 *
 * theme/palette.ts still carries an `iconCircle` key with these two circle
 * values in it. It predates 6f, when every circle was the same grey, and
 * nothing reads it. Delete it once the list screen is converted.
 */
export const PLACEHOLDER_SHADE: Record<Scheme, Shade> = {
  dark: { color: "#ECEDEE", tint: "#2C2C2E" },
  light: { color: "#6E6E73", tint: "#E5E5EA" },
};

/*
 * Which colour a category gets.
 *
 * Worked out from its id rather than stored, so nothing needs a column or a
 * migration and every category has one from the moment it exists, hand-made
 * ones included. The same id always lands on the same colour, so a colour
 * never moves by itself.
 *
 * The hash picks a POSITION; the scheme picks which half of that position to
 * use. So a category keeps its identity across a theme switch — Transport is
 * the fifth colour in both modes, not a different colour in each.
 *
 * Once a picker exists to choose a colour, a stored one simply overrides this.
 */
export const shadeForCategory = (id: string, scheme: Scheme): Shade => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ICON_SHADES[Math.abs(h) % ICON_SHADES.length][scheme];
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

/*
 * `scheme` is REQUIRED, deliberately, and it is the last argument so the two
 * existing ones keep their positions.
 *
 * A default of "dark" would have saved editing the call sites. It would also
 * mean a screen that forgets to pass its scheme draws dark icons on a light
 * page, with nothing thrown and nothing logged — the same silent shape as a
 * screen that cannot blur for its own write. Required means the compiler
 * names every caller instead.
 */
export const iconFor = (
  categoryId: string | null,
  chosen: string | undefined,
  scheme: Scheme,
): ResolvedIcon => {
  const shade =
    chosen && categoryId
      ? shadeForCategory(categoryId, scheme)
      : PLACEHOLDER_SHADE[scheme];
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
  scheme: Scheme,
): ResolvedIcon =>
  iconFor(categoryId, categoryId ? icons[categoryId] : undefined, scheme);

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