import { View, Text, TextInput, StyleSheet, Pressable } from "react-native";
import React, { useRef, useState } from "react";
import { sanitizeAmount, toMinorBDT } from "@/helpers/helper";

type props = {
  onAdd: (title: string, amountMinor: number) => void;
};

export default function ExpenseForm({ onAdd }: props) {
  const [amount, setAmount] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const titleRef = useRef<TextInput>(null);
  const amountRef = useRef<TextInput>(null);

  const amountMinor = toMinorBDT(amount);
  const canSave = amountMinor !== null && title.trim().length > 0;

  const handleSave = () => {
    // parsing comes in Step 4 — deliberately naive for now
    onAdd(title, Number(amount) * 100);
    setTitle("");
    setAmount("");
    amountRef.current?.focus();
  };

  return (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={(t) => setAmount(sanitizeAmount(t))}
        placeholder="0.00"
        keyboardType="decimal-pad"
        maxLength={12}
      />
      <TextInput
        ref={titleRef}
        style={styles.input}
        value={title}
        returnKeyType="done"
        onSubmitEditing={handleSave}
        maxLength={60}
        onChangeText={setTitle}
        placeholder="What for?"
        placeholderTextColor="#9aa0a6"
      />
      <Pressable style={[styles.button, !canSave && { opacity: 0.4 }]} onPress={handleSave} disabled={!canSave}>
        <Text style={styles.buttonText}>Add Exoense</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  form: {
    padding: 16,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#d0d0d0",
    backgroundColor: "#fff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#1f6feb",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
