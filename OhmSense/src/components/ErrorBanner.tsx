import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "../constants/colors";
import { radii, spacing } from "../constants/config";

interface ErrorBannerProps {
  message: string;
}

/**
 * Surfaces the message the device service rejected with.
 *
 * The reducer already carries it (`DeviceState.error`) and clears it on the next
 * connect attempt, so this component only renders what it is given and owns no
 * state of its own. The status badge above it says that something failed; this
 * says what to do about it.
 */
export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <View
      style={styles.banner}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Error: ${message}`}
    >
      <Feather name="alert-circle" size={18} color={colors.statusError} style={styles.icon} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.statusError,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  icon: {
    marginRight: spacing.md,
    marginTop: 1,
  },
  message: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
});
