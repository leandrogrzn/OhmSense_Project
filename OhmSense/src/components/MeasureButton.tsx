import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/config";

interface MeasureButtonProps {
  label: string;
  onPress: () => void;
  disabled: boolean;
}

export function MeasureButton({ label, onPress, disabled }: MeasureButtonProps) {
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
        <Feather name="play" size={18} color={colors.onAccent} />
        <Text style={styles.label}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    borderRadius: radii.button,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    backgroundColor: colors.accentPressed,
  },
  disabled: {
    opacity: 0.4,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginLeft: spacing.sm,
  },
});
