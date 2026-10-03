import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors } from "../constants/colors";
import { EMPTY_PLACEHOLDER, radii, spacing } from "../constants/config";
import { formatResistance } from "../utils/formatResistance";

interface ResistanceCardProps {
  resistance: number | null;
  subtitle: string;
  isMeasuring: boolean;
}

export function ResistanceCard({ resistance, subtitle, isMeasuring }: ResistanceCardProps) {
  const formatted = resistance === null ? null : formatResistance(resistance);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>RESISTENCIA</Text>
        <Feather name="zap" size={18} color={colors.accent} />
      </View>

      <View style={styles.valueArea}>
        {formatted ? (
          <View style={styles.valueRow}>
            <Text
              style={styles.value}
              accessibilityLabel={`Resistencia ${formatted.value} ${formatted.unit}`}
            >
              {formatted.value}
            </Text>
            <Text style={styles.unit}>{formatted.unit}</Text>
          </View>
        ) : (
          <Text style={styles.value}>{EMPTY_PLACEHOLDER}</Text>
        )}
      </View>

      <View style={styles.subtitleRow}>
        {isMeasuring ? (
          <ActivityIndicator size="small" color={colors.accent} style={styles.spinner} />
        ) : null}
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.accentLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 220,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
  valueArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  value: {
    color: colors.textPrimary,
    fontSize: 64,
    fontWeight: "700",
    letterSpacing: -2,
    fontVariant: ["tabular-nums"],
  },
  unit: {
    color: colors.accent,
    fontSize: 26,
    fontWeight: "600",
    marginLeft: spacing.sm,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  spinner: {
    marginRight: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  accentLine: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: colors.accent,
  },
});
