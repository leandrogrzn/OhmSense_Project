import { StyleSheet, Text, View } from "react-native";

import { connectionStateColors } from "../constants/colors";
import { ESTADO_LABELS, radii, spacing } from "../constants/config";
import type { ConnectionState } from "../types/device";

interface ConnectionStatusProps {
  state: ConnectionState;
}

export function ConnectionStatus({ state }: ConnectionStatusProps) {
  const color = connectionStateColors[state];

  return (
    <View
      style={[styles.badge, { borderColor: color }]}
      accessibilityRole="text"
      accessibilityLabel={`Estado: ${ESTADO_LABELS[state]}`}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>Estado: {ESTADO_LABELS[state]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radii.badge,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
});
