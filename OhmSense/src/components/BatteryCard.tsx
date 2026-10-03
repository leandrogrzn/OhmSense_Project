import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "../constants/colors";
import {
  charging as chargingCopy,
  MAX_BATTERY_PERCENT,
  radii,
  spacing,
} from "../constants/config";
import { formatChargeTime } from "../utils/formatChargeTime";

interface BatteryCardProps {
  battery: number | null;
  charging: boolean;
  chargeTime: number | null;
}

export function BatteryCard({ battery, charging, chargeTime }: BatteryCardProps) {
  const percentage = battery === null ? 0 : Math.min(MAX_BATTERY_PERCENT, Math.max(0, battery));
  const formattedChargeTime = charging ? formatChargeTime(chargeTime) : "";

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Estado de la Batería</Text>
        <Feather
          name={charging ? "battery-charging" : "battery"}
          size={18}
          color={charging ? colors.accent : colors.textSecondary}
        />
      </View>

      <View style={styles.percentageRow}>
        <Text style={styles.percentage}>{battery === null ? "—" : percentage}</Text>
        <Text style={styles.percentSign}>%</Text>
      </View>

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: MAX_BATTERY_PERCENT, now: percentage }}
      >
        <View style={[styles.fill, { width: `${percentage}%` }]} />
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerLabel}>
          {charging ? chargingCopy.label : chargingCopy.notChargingLabel}
        </Text>
        {charging && formattedChargeTime ? (
          <Text style={styles.footerValue}>
            {chargingCopy.timeLabel}: {formattedChargeTime}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  percentageRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  percentage: {
    color: colors.textPrimary,
    fontSize: 34,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  percentSign: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 2,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.batteryTrack,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: colors.batteryFill,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  footerLabel: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  footerValue: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "600",
  },
});
