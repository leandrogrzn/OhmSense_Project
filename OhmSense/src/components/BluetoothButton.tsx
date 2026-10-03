import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/config";

interface BluetoothButtonProps {
  label: string;
  onPress: () => void;
  disabled: boolean;
}

export function BluetoothButton({ label, onPress, disabled }: BluetoothButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.content}>
        <Feather name="bluetooth" size={18} color={colors.accent} />
        <Text style={styles.label}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: radii.button,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  disabled: {
    opacity: 0.4,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginLeft: spacing.sm,
  },
});
