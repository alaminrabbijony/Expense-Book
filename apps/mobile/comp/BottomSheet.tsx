import { useEffect, type ReactNode } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export default function BottomSheet({ visible, title, onClose, children }: Props) {
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

        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // justifyContent pins the panel to the bottom of the window.
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#171B22",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    // Also keeps the last control above the gesture bar, because the sheet
    // itself now runs down behind it.
    paddingBottom: 28,
    maxHeight: "70%",
  },
  sheetTitle: {
    color: "#8A8F98",
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
});