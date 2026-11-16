import Ionicons from "@expo/vector-icons/Ionicons";
import { CategoryGlyph, iconFor, iconForRow } from "@/comp/categoryIcon";
import type { CategoryIcons } from "@/db/expenses";
import { DARK, LIGHT, type Palette, type Scheme } from "@/theme/palette";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

/*
 * Tap feedback for the name and the circle, the two controls on a row that
 * do something: Android ripples, iOS dims. YOURS TO RESTYLE.
 *
 * One per scheme, because a ripple is picked by what is BEHIND it: white on
 * a light card is invisible and the tap looks like it did nothing. Built at
 * module load, so the object handed to android_ripple is the same object on
 * every render.
 */
const RIPPLES: Record<Scheme, { color: string }> = {
  dark: { color: DARK.rippleOnCard },
  light: { color: LIGHT.rippleOnCard },
};

// Deliberately NOT CategoryListItem from CategoryLListItem.tsx.
//
// That type carries id: string | null, because the filter sheet has an
// "All categories" row that is not a category. Every row here IS a real
// row in the categories table, so id is a plain string and nothing in this
// file has to ask whether it might be null.
export type ManageItem = { id: string; name: string };

type Props = {
  items: ManageItem[];
  /*
   * Which categories have an icon, as a map of id to the STORED value —
   * "fast-food-outline" for an Ionicons glyph, "mci:rice" for a
   * MaterialCommunityIcons one. A category that has not been given one is
   * simply absent, and iconForRow falls through to the grey placeholder.
   *
   * Nothing in this file reads that prefix. iconForRow hands back a family
   * and CategoryGlyph draws it, so only comp/categoryIcon.tsx ever names a
   * font.
   *
   * Passed in rather than read here, for the same reason the two ids below
   * are: this component never reaches into db/. The screen owns the read, so
   * the screen can keep it fresh.
   */
  icons: CategoryIcons;
  /*
   * Which palette to draw in.
   *
   * A PROP, not useColorScheme() called here, and that is the same choice
   * todayStart and clock24 already made. The screen reads the phone once and
   * hands the answer down, so every row in one render is drawn from the same
   * palette and a child can never disagree with its parent about the theme.
   * It also keeps this component the way it already is: everything arrives
   * as a prop and nothing is read from outside.
   */
  scheme: Scheme;
  // Which row is currently loaded into the field at the top. Its name goes
  // dim and it shows no buttons, because its controls moved up there. null
  // means nothing is being edited.
  editingId: string | null;
  /*
   * The icon picked for the editing row but NOT yet written — null for "no
   * icon". Only the row whose id is editingId reads it.
   *
   * It has to be a prop rather than a lookup in `icons`, because nothing is
   * written until ✓. Reading the saved map instead would leave the circle
   * showing the old icon after every pick, and a picker that appears to do
   * nothing throws no error.
   */
  draftIcon: string | null;
  // The row that gets no delete button. The parent passes UNCATEGORISED_ID.
  //
  // Taken as a prop rather than imported, so this component never reaches
  // into db/. deleteCategory throws on that id anyway — the hidden button
  // is the experience, the throw is the guarantee.
  undeletableId: string;
  /*
   * The row whose circle never becomes an icon button. The parent passes
   * UNCATEGORISED_ID here too.
   *
   * A SECOND prop holding the same value, on purpose. "Can this row be
   * deleted" and "can this row be given an icon" are two questions, and one
   * value answering both is only correct for as long as the answers happen
   * to agree. setCategoryIcon throws on that id as well; the inert circle is
   * the experience, the throw is the guarantee.
   */
  noIconId: string;
  // Tapping a row's NAME opens that category's own page. Same reasoning as
  // the two ids: this component says what happened, the screen decides that
  // it means a route push.
  onOpen: (item: ManageItem) => void;
  onEdit: (item: ManageItem) => void;
  onDelete: (item: ManageItem) => void;
  // Tapping the editing row's circle. The screen opens the catalog sheet.
  onPickIcon: (item: ManageItem) => void;
  /*
   * Where each row sits inside the scrolling content, reported as it is laid
   * out. The screen uses it to scroll a row out from under the keyboard.
   *
   * Measured rather than worked out from a row height times an index: the
   * row's padding, its circle and its gap are all YOURS TO RESTYLE, and a
   * hand-kept height would start scrolling to the wrong place the first time
   * one of them changed, with nothing to warn.
   */
  onRowLayout: (id: string, y: number) => void;
};

export default function CategoryManageList({
  items,
  icons,
  scheme,
  editingId,
  draftIcon,
  undeletableId,
  noIconId,
  onOpen,
  onEdit,
  onDelete,
  onPickIcon,
  onRowLayout,
}: Props) {
  /* One lookup, not a rebuild. Both StyleSheets were built once at module
   * load, so switching theme costs an object read. */
  const styles = STYLES[scheme];
  const ripple = RIPPLES[scheme];

  return (
    <View>
      {items.map((item) => {
        const editing = editingId === item.id;
        const canPickIcon = editing && item.id !== noIconId;
        /* Every row except the one being edited recedes while the field at
         * the top is loaded. See styles.rowDimmed. */
        const dimmed = editingId !== null && !editing;

        /*
         * iconFor and iconForRow are the SAME two functions the expense rows
         * and the category page's big circle use. One set of rules, so this
         * list and Home can never disagree about a category's glyph, its
         * colour or its fallback.
         *
         * While editing, the icon shown is the DRAFT — iconFor takes a
         * stored value directly, which is exactly the case it was split off
         * for: a value only being considered gets the same font, colour and
         * fallback as a saved one.
         *
         * The scheme goes in as well, because the twelve colours have a
         * light set: a dark glyph on a pale disc rather than a bright glyph
         * on a dark one. The hash still picks the same POSITION in both, so
         * a category keeps its identity across the switch.
         */
        const icon = editing
          ? iconFor(item.id, draftIcon ?? undefined, scheme)
          : iconForRow(item.id, icons, scheme);

        const circleBody = (
          <>
            {/* CategoryGlyph, not Ionicons. The glyph may belong to either
                installed font, and icon.family is what says which. This file
                never has to know. */}
            <CategoryGlyph
              family={icon.family}
              name={icon.name}
              size={20}
              color={icon.color}
            />

            {/* The "this can be changed" mark, on only while this row is
                being edited.

                Drawn with Ionicons directly, on purpose: it is app
                furniture, like the ⋯, the ✕ and the ✓, not a category's own
                icon. Only a category's icon goes through CategoryGlyph.

                LOW AND RIGHT, NOT OVER THE MIDDLE, and the reason is
                arithmetic. The glyph is 20 in a 40 circle, so it occupies 10
                to 30 on both axes; a centred 26 disc occupied 7 to 33 and
                hid every pixel of it.

                WHY IT IS NOT IN THE CORNER ANY MORE. It was 18 at right: 0,
                bottom: 0 until Session 35, and on the device a quarter of it
                was missing. The corner of a 40x40 box is 28.3 from the
                centre and the circle's edge is at 20, so the corner is
                OUTSIDE the circle — and iconCircle's overflow: "hidden"
                trimmed everything past the edge. Only 76.3% of the badge was
                ever drawn [V, computed]. No badge pinned to that corner can
                fit, at any size.

                So it moved in. A badge fits only while its centre is within
                (20 - its own radius) of the circle's centre: for 14 that is
                13, and an inset of 4 puts the centre 12.73 away. An inset of
                3 puts it at 14.14 and clips again.

                THE SIZE CAME DOWN BECAUSE MOVING IN COSTS COVERAGE. Measured
                as a share of the glyph's 20x20 box: the old clipped 18 hid
                11.7%, an 18 moved to inset 4 would hide 31.4%, and 14 at
                inset 4 hides 13.4% [V, all computed]. A full circle for
                1.7 points.

                A NUMBER THAT DID NOT SURVIVE CHECKING: this comment used to
                say the 18 badge hid "16%". That cannot be reproduced on
                either basis — 11.7% of the glyph's box, or 8.1% of a 20
                circle inscribed in it. Both are computed; the 16% is not
                from this geometry.

                There is no veil over the circle either. A veil was only ever
                there to carry a white pencil, and the pencil brings its own
                disc — so all it did was dim the icon you are trying to look
                at.

                The disc and the pencil are NOT in the palette. Black at 55%
                carries a white pencil over both sets of tints: it reads 16.50
                at worst over the dark twelve and 5.77 over the pale twelve
                [V, both computed]. The 6.21 that used to be written here was
                wrong; 5.77 is also what session34.md recorded.

                KNOWN WEAKNESS, open at Session 35. Those two numbers answer
                "is the pencil readable", and the disc passes. Nobody asked
                how loud the DISC is, and the two modes are nothing alike:
                against the circle it sits on it reads 1.32-1.72 in dark and
                4.40-4.49 in light [V, computed]. So it is a shadow in dark
                mode and a solid dark coin in light mode. Inverting it for
                light — rgba(255,255,255,0.85) with a #1C1C1E pencil — matches
                dark on all three measures, and is Rabbi's call, not made.

                pointerEvents none, or it would swallow the tap meant for the
                Pressable it sits inside. */}
            {canPickIcon && (
              <View style={styles.circlePencil}>
                <Ionicons name="pencil" size={8} color="#FFFFFF" />
              </View>
            )}
          </>
        );

        return (
          <View
            key={item.id}
            style={[styles.row, dimmed && styles.rowDimmed]}
            /* y is this row's top inside the scrolling content, which is
             * exactly what the screen's scrollTo takes. It fires on first
             * layout and again whenever the row moves. */
            onLayout={(e) => onRowLayout(item.id, e.nativeEvent.layout.y)}
          >
            {/* OUTSIDE the name's Pressable, never inside it. Session 16's
                rule puts the tap target around the name only, and this
                circle is a control in its own right while editing.

                hitSlop takes the touch area from 40 to 56. Safe only because
                the circle is a button in edit mode alone, and in that state
                the name beside it is a plain Text with no tap of its own to
                overlap. */}
            {canPickIcon ? (
              <Pressable
                /*
                 * REBUILT ON A THEME SWITCH, and this is a real bug, not a
                 * precaution. android_ripple reaches Android as
                 * nativeBackgroundAndroid, and React Native answers it by
                 * rebuilding the view's WHOLE background as one composite
                 * drawable with the ripple as a layer inside it
                 * (ReactViewManager.setNativeBackground ->
                 * BackgroundStyleApplicator.setFeedbackUnderlay, 0.81.5
                 * [V, source]). backgroundColor stops being something the
                 * view can update and becomes part of a drawable assembled
                 * once — so this circle would keep its old tint.
                 *
                 * A key makes React throw the view away and build a new one,
                 * which is the only thing that gets a fresh drawable.
                 *
                 * The name's Pressable below needs no key: nameTap carries
                 * no background, so it has nothing that can go stale.
                 *
                 * Narrow but real — it only shows if the theme changes while
                 * a row is in edit mode. The same bug hid in the tab bar's +
                 * since Session 34 and in every expense card until Session 35.
                 */
                key={scheme}
                accessibilityRole="button"
                accessibilityLabel={`Choose an icon for ${item.name}`}
                android_ripple={ripple}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.iconCircle,
                  { backgroundColor: icon.tint },
                  Platform.OS === "ios" && pressed ? styles.iosPressed : null,
                ]}
                onPress={() => onPickIcon(item)}
              >
                {circleBody}
              </Pressable>
            ) : (
              <View style={[styles.iconCircle, { backgroundColor: icon.tint }]}>
                {circleBody}
              </View>
            )}

            {/* The name is its own Pressable, a SIBLING of Edit and Delete.
                Not a Pressable wrapped around the whole row: those two are
                already Pressables, and a Pressable inside a Pressable has no
                reliable winner.

                While this row is loaded into the field at the top it is a
                plain Text again. Tapping it would push a page and throw away
                whatever is being typed up there. */}
            {editing ? (
              <Text style={[styles.name, styles.nameEditing]} numberOfLines={1}>
                {item.name}
              </Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.name}`}
                android_ripple={ripple}
                style={({ pressed }) => [
                  styles.nameTap,
                  Platform.OS === "ios" && pressed ? styles.iosPressed : null,
                ]}
                onPress={() => onOpen(item)}
              >
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
              </Pressable>
            )}

            {/* While a row is being edited its buttons disappear, because
                the field at the top is now driving it. Other rows keep
                theirs — tapping Edit on another row just switches which
                one the field holds. */}
            {editing ? null : (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => onEdit(item)}
                  hitSlop={8}
                  style={styles.action}
                >
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>

                {item.id === undeletableId ? null : (
                  <Pressable
                    onPress={() => onDelete(item)}
                    hitSlop={8}
                    style={styles.action}
                  >
                    <Text style={[styles.actionText, styles.deleteText]}>
                      Delete
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/*
 * The StyleSheet, as a function of a palette.
 *
 * Called twice below, at module load, and never again. Building it inside the
 * component instead would make a new StyleSheet on every render — and this
 * screen renders on every keystroke in the Add pill.
 */
const makeStyles = (c: Palette) =>
  StyleSheet.create({
    /*
     * YOURS TO RESTYLE — the category row, the same card as an expense. Every
     * value here is copied from styles.card and styles.rowGap in
     * comp/ExpenseListScreen.tsx rather than chosen again, so the two lists
     * cannot drift apart. gap: 12 is that card's gap between its circle, its
     * text and its amount.
     *
     * There is no bottom border. A card list separates rows with the 10 gap
     * below each card; a line as well would be two separators doing one job.
     *
     * overflow is mechanism, not looks. The name's ripple is a rectangle, and
     * without this it paints square corners over the rounded ones. It also
     * trims the pencil badge to the circle. The card has no shadow, so it cuts
     * nothing off on iOS either.
     */
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 10,
      borderRadius: 16,
      backgroundColor: c.card,
      overflow: "hidden",
    },
    /*
     * YOURS TO RESTYLE — how far the other rows recede while one is being
     * edited.
     *
     * Per row, not a layer over the list. The category page can lay a scrim
     * over its list because the thing being edited — its card — sits above
     * that list. Here the thing being edited is a row INSIDE the list, and a
     * layer would cover the very circle you have to tap.
     *
     * THE NUMBER COMES FROM THE PALETTE, and that is not tidiness. Opacity
     * blends the row's card AND its text toward the page, so one value cannot
     * serve both themes: 0.40 over the black page leaves a row's text reading
     * 3.07 against its own card, and 0.40 over the #F2F2F7 light page leaves
     * it at 2.56 — just under the 2.57 already rejected as unreadable. Light
     * mode uses 0.47, which gives 3.12 [V, all computed].
     *
     * Three numbers in this comment were wrong until Session 35: it said
     * 2.39, it said light used 0.50, and it said 0.50 gave 3.09. The code has
     * always read c.dimOpacity, which the palette sets to 0.47 — so the
     * comment was describing a value the file never used.
     */
    rowDimmed: { opacity: c.dimOpacity },
    /* The same 40 circle with a 20 glyph as an expense row. No
     * backgroundColor here: every category supplies its own, from its derived
     * colour or from the grey placeholder, so one declared here would never
     * apply.
     *
     * overflow is here for the Android ripple, which is drawn as a rectangle
     * and would paint square corners over this round one.
     *
     * It no longer has anything else to do. Until Session 35 it was also
     * trimming the pencil badge, which sat in the corner outside the circle's
     * edge — that was the bug, not a feature. The badge now fits inside on
     * its own, so removing this line would leave it whole and only break the
     * ripple. */
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    /* YOURS TO RESTYLE — the edit-mode pencil. Low and right of centre
     * rather than over the middle, so the icon underneath stays readable.
     *
     * 14 AT AN INSET OF 4, and every one of those numbers is load-bearing.
     * See the JSX comment for the arithmetic; the short version is that the
     * badge has to sit entirely inside the circle, and at this size 4 is the
     * smallest whole inset that does it. Changing the size means changing
     * the inset with it, or the badge is clipped again.
     *
     * The pencil is 8, which is the same share of its disc that a 10 pencil
     * was of the old 18 one.
     *
     * Not from the palette: black at 55% carries a white pencil on every tint
     * in both sets. See the comment at its JSX. */
    circlePencil: {
      position: "absolute",
      right: 4,
      bottom: 4,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
    },
    // flex: 1 gives the name the leftover room so it truncates instead of
    // squeezing the two buttons. numberOfLines on the Text does the cutting.
    // The spacing to the buttons is the row's gap now, not padding here.
    //
    // 14.52 against the card in dark, 15.25 in light.
    name: { color: c.text, fontSize: 16, fontWeight: "500", flex: 1 },
    /*
     * The row that is loaded into the field at the top.
     *
     * It USED to be struck through as well. Dropped at Session 35, because
     * two marks on one row were saying opposite things:
     *
     *   - rowDimmed already fades every OTHER row, so this one is the only
     *     bright row on the screen. That alone says "this is the one".
     *   - a strikethrough means DELETED everywhere else in this app — the
     *     undo row crosses out a deleted expense, and the delete dialog
     *     strikes the name it is about to remove.
     *
     * The colour on its own still separates it: this name reads 5.07 against
     * its white card while every other row's reads 3.12 through the dim
     * [V, computed]. The row being edited is still the most readable thing
     * on screen.
     */
    nameEditing: { color: c.textDim },
    actions: { flexDirection: "row", gap: 16 },
    action: { paddingVertical: 2 },
    // 5.24 against the card in dark, 4.54 in light.
    actionText: { color: c.textDim, fontSize: 14, fontWeight: "500" },
    /* dangerInk, not danger. Danger is the FILL under the Add knob and the
     * dialog's Delete button, and white has to read on it. This is TEXT on a
     * card, which pulls the other way: #E5484D reads 4.35 on the dark card
     * and 3.51 on the light one, so light mode uses #C62B30 at 4.97. */
    deleteText: { color: c.dangerInk },
    // The tappable area around the name. flex: 1 so the whole leftover width
    // of the row takes the tap, not just the width of the word.
    nameTap: { flex: 1 },
    // iOS only. Android shows the ripple instead.
    iosPressed: { opacity: 0.6 },
  });

const STYLES: Record<Scheme, ReturnType<typeof makeStyles>> = {
  dark: makeStyles(DARK),
  light: makeStyles(LIGHT),
};