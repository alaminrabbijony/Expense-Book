import { useEffect, type ReactNode } from "react";
import {
  Dimensions,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { PALETTES, schemeOf, type Palette, type Scheme } from "@/theme/palette";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export default function BottomSheet({ visible, title, onClose, children }: Props) {
  /*
   * The scheme is read HERE rather than taken as a prop, and that is the
   * opposite of what comp/CategoryManageList.tsx does.
   *
   * The parent is what decides. CategoryManageList's parent already calls
   * useColorScheme() and is re-rendering anyway, so a prop costs nothing
   * there. This sheet's parent is app/(tabs)/_layout.tsx, which holds the
   * whole tab navigator — and useColorScheme() re-renders the component that
   * calls it. AddTabButton was made its own component for exactly that
   * reason, so giving this sheet a scheme prop would put the hook back into
   * the layout and undo it.
   *
   * comp/ExpenseForm.tsx has the same parent and reads it the same way.
   */
  const scheme = schemeOf(useColorScheme());
  const styles = STYLES[scheme];

  /*
   * Dev log: every keyboard event while the sheet is open.
   *
   * These are React Native's own events, and they arrive AFTER the keyboard
   * has finished moving. The sheet no longer waits for them — it follows the
   * keyboard frame by frame — so this log says when the keyboard came and
   * went, not when the sheet moved.
   *
   * Android only sends the "Did" events. The "Will" ones are iOS only.
   */
  useEffect(() => {
    if (!__DEV__ || !visible) return;
    const t0 = Date.now();
    const subs = [
      Keyboard.addListener("keyboardDidShow", (e) =>
        console.log(
          `keyboard show: height ${Math.round(e.endCoordinates.height)}, ` +
            `top at ${Math.round(e.endCoordinates.screenY)}, ` +
            `${Date.now() - t0}ms after the sheet opened`,
        ),
      ),
      Keyboard.addListener("keyboardDidHide", () =>
        console.log(`keyboard hide: ${Date.now() - t0}ms after the sheet opened`),
      ),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android hardware/gesture back. Without it, back tries to leave the
      // screen while the sheet is still on top of it.
      onRequestClose={onClose}
    >
      {/* This has to be INSIDE the Modal. A Modal is a separate native
          window, so a KeyboardAvoidingView wrapping the screen cannot
          move anything in here.

          From react-native-keyboard-controller, not React Native.

          Android: the app is edge-to-edge, so the Modal's window does not
          shrink for the keyboard; the room has to be made here. React
          Native's own KeyboardAvoidingView made it too late — it only hears
          about the keyboard once it has finished moving — and on Android it
          treats "keyboard hidden" as one more position to avoid, so the sheet
          stayed lifted by the height of the system bars after the keyboard
          closed. This one's padding follows the keyboard's movement and is
          exactly 0 when it is closed, so the sheet sits on the bottom edge.

          It only moves inside the KeyboardProvider in app/_layout.tsx.

          "padding", not "height": padding adds space inside this view and
          leaves its own size alone.

          The padding is only right because this view fills the Modal from
          the top of the screen. It measures itself from its parent's top,
          and the keyboard's top as the window height minus the keyboard
          height; those agree only when this view's top is the window's top.
          Do not wrap it in anything with a margin or a header above it. */}
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        {/* Fills the window and sits behind the panel, so a tap anywhere
            outside closes. Rendered before the sheet, so the sheet wins. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={styles.sheet}
          /*
           * DEV ONLY, and here to settle one question: there is a ~46dp band
           * of dimmed page between this sheet's bottom edge and the top of
           * the keyboard, and it predates the palette — it is in screenshots
           * from before this file was themed.
           *
           * This prints where the sheet's bottom actually lands. Read it
           * beside the "keyboard show" line above: that one gives the
           * keyboard's own top as "top at N", and the gap is the difference.
           *
           * It fires several times while the keyboard animates. The LAST
           * line is the settled one; the earlier ones are the sheet on its
           * way up.
           */
          onLayout={(e) => {
            if (!__DEV__) return;
            const { y, height } = e.nativeEvent.layout;
            console.log(
              `sheet layout: top ${Math.round(y)}, height ${Math.round(height)}, ` +
                `bottom ${Math.round(y + height)}, ` +
                `window ${Math.round(Dimensions.get("window").height)}`,
            );
          }}
        >
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    /*
     * justifyContent pins the panel to the bottom of the window.
     *
     * THE DIM COLOUR BELONGS ON THIS VIEW AND MUST NOT MOVE OFF IT. Splitting
     * the layout from the colour — putting c.scrim on a wrapper View around
     * the KeyboardAvoidingView — breaks the keyboard. See the long comment at
     * the call site: this view works out the keyboard's top as the window
     * height minus the keyboard height, and compares that with its OWN
     * measured top. The two agree only while its top is the window's top. A
     * wrapper with any offset at all puts the sheet in the wrong place,
     * Android only, and only while the keyboard is up — so it reads as a
     * layout bug rather than a theming one.
     */
    backdrop: { flex: 1, backgroundColor: c.scrim, justifyContent: "flex-end" },
    sheet: {
      /*
       * The sheet is a PAGE, not a raised surface. So page here and card on
       * the fields inside it — the same pair every list screen uses, reading
       * 1.23 in dark and 1.12 in light.
       *
       * Do NOT reach for menuBg because a sheet sits on top of things. That
       * token belongs to the period menu, and here it would read 1.22 against
       * the fields in dark — which looks very nearly right — and 1.00 in
       * light, where white fields on a white sheet vanish completely with
       * nothing thrown. Dark mode cannot catch that one.
       */
      backgroundColor: c.page,
      /*
       * In DARK this line is the only edge the sheet has. The backdrop over
       * the black page is also black, so the sheet's own edge reads 1.00 and
       * the corner radius draws nothing at all.
       *
       * In LIGHT the sheet already has an edge without it: the backdrop
       * renders mid-grey over the pale page, so the edge reads 5.54 on its
       * own and this line is decoration rather than mechanism.
       *
       * Kept in both anyway. line reads 1.51 dark and 1.53 light — a matched
       * pair, the same two numbers the tab bar's top line produces — and one
       * structure for both modes is one thing to reason about.
       */
      borderTopWidth: 1,
      borderTopColor: c.line,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: 16,
      // Also keeps the last control above the gesture bar, because the sheet
      // itself now runs down behind it.
      paddingBottom: 28,
      maxHeight: "70%",
    },
    sheetTitle: {
      /*
       * 6.46 on the dark sheet and 4.54 on the light one, against the 4.5 a
       * 13px uppercase label needs. Both colours are solid, so there is no
       * blend here and 4.54 is exact rather than rounded.
       *
       * That 0.04 of margin makes this label a tripwire on the LIGHT page
       * value: darken page at all and this is the first text in the app to
       * fail. placeholder would give 5.37, but that token means text inside a
       * field and this is a section label — the wrong role for the right
       * number.
       */
      color: c.textDim,
      fontSize: 13,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
  });
}

/*
 * Built twice at module load, once per palette — the shape every themed file
 * in this project uses. There are exactly two palettes and both are written
 * in the source, so nothing is computed at runtime and nothing can go stale.
 */
const STYLES: Record<Scheme, ReturnType<typeof makeStyles>> = {
  dark: makeStyles(PALETTES.dark),
  light: makeStyles(PALETTES.light),
};