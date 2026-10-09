import Ionicons from "@expo/vector-icons/Ionicons";
import { iconFor, iconForRow } from "@/comp/categoryIcon";
import type { CategoryIcons } from "@/db/expenses";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

/*
 * Tap feedback for the name and the circle, the two controls on a row that
 * do something: Android ripples, iOS dims. YOURS TO RESTYLE.
 */
const RIPPLE = { color: "rgba(255,255,255,0.12)" };
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
   * Which categories have an icon, as a map of id to glyph name. A category
   * that has not been given one is simply absent, and iconForRow falls
   * through to the grey placeholder.
   *
   * Passed in rather than read here, for the same reason the two ids below
   * are: this component never reaches into db/. The screen owns the read, so
   * the screen can keep it fresh.
   */
  icons: CategoryIcons;
  // Which row is currently loaded into the field at the top. Its name is
  // struck through and it shows no buttons, because its controls moved up
  // there. null means nothing is being edited.
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
         * While editing, the icon shown is the DRAFT — iconFor takes a name
         * directly, which is exactly the case it was split off for: a value
         * only being considered gets the same colour and the same fallback
         * as a saved one.
         */
        const icon = editing
          ? iconFor(item.id, draftIcon ?? undefined)
          : iconForRow(item.id, icons);

        const circleBody = (
          <>
            <Ionicons name={icon.name} size={20} color={icon.color} />

            {/* The "this can be changed" mark, on only while this row is
                being edited.

                IN THE CORNER, NOT OVER THE MIDDLE, and the whole reason is
                arithmetic. The glyph is 20 in a 40 circle, so it occupies 10
                to 30 on both axes; a centred 26 disc occupied 7 to 33 and hid
                every pixel of it. An 18 badge in the bottom-right corner
                hides 16% of the glyph's area.

                There is no veil over the circle either. A veil was only ever
                there to carry a white pencil, and the pencil brings its own
                disc — so all it did was dim the icon you are trying to look
                at. Without it the weakest glyph in the palette reads 3.54
                instead of 2.39, and the white pencil on its disc still reads
                16.5 at worst [V, computed].

                pointerEvents none, or it would swallow the tap meant for the
                Pressable it sits inside. */}
            {canPickIcon && (
              <View style={styles.circlePencil}>
                <Ionicons name="pencil" size={10} color="#FFFFFF" />
              </View>
            )}
          </>
        );

        return (
          <View
            key={item.id}
            style={[styles.row, dimmed && styles.rowDimmed]}
            /* y is this row's top inside the scrolling content, which is
             * exactly what scrollTo takes. It fires on first layout and
             * again whenever the row moves. */
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
                accessibilityRole="button"
                accessibilityLabel={`Choose an icon for ${item.name}`}
                android_ripple={RIPPLE}
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
                android_ripple={RIPPLE}
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

const styles = StyleSheet.create({
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
    backgroundColor: "#1C1C1E",
    overflow: "hidden",
  },
  /*
   * YOURS TO RESTYLE — how far the other rows recede while one is being
   * edited.
   *
   * Per row, not a layer over the list. The category page can lay a
   * rgba(0,0,0,0.6) sheet over its list because the thing being edited — its
   * card — sits above that list. Here the thing being edited is a row INSIDE
   * the list, and a layer would cover the very circle you have to tap.
   *
   * 0.40 rather than a rounder number: over the black page it leaves a row's
   * text reading 3.07 against its own card, which is exactly what the
   * category page's 0.6 dim leaves [V, both computed]. 0.35 gives 2.57 and
   * stops being readable.
   */
  rowDimmed: { opacity: 0.4 },
  /* The same 40 circle with a 20 glyph as an expense row. No
   * backgroundColor here: every category supplies its own, from its derived
   * colour or from the grey placeholder, so one declared here would never
   * apply.
   *
   * overflow keeps the Android ripple round once this becomes a button, and
   * keeps the corner badge inside the circle. */
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  /* YOURS TO RESTYLE — the edit-mode pencil. Pinned to the circle's
   * bottom-right rather than centred, so the icon underneath stays
   * readable. 18 hides 16% of the glyph's area; a 22 badge would hide 36%. */
  circlePencil: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  // flex: 1 gives the name the leftover room so it truncates instead of
  // squeezing the two buttons. numberOfLines on the Text does the cutting.
  // The spacing to the buttons is the row's gap now, not padding here.
  name: { color: "#ECEDEE", fontSize: 16, fontWeight: "500", flex: 1 },
  nameEditing: {
    textDecorationLine: "line-through",
    color: "#8A8F98",
  },
  actions: { flexDirection: "row", gap: 16 },
  action: { paddingVertical: 2 },
  // 5.24 against the card, computed.
  actionText: { color: "#8A8F98", fontSize: 14, fontWeight: "500" },
  // 4.35 against the card, computed.
  deleteText: { color: "#E5484D" },
    // The tappable area around the name. flex: 1 so the whole leftover width
  // of the row takes the tap, not just the width of the word.
  nameTap: { flex: 1 },
  // iOS only. Android shows the ripple instead.
  iosPressed: { opacity: 0.6 },
});