import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export default function BottomSheet({ visible, title, onClose, children }: Props) {
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
          move anything in here. */}
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
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