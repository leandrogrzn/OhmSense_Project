import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "../constants/colors";
import { APP_NAME, spacing } from "../constants/config";

export function Header() {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.title}>{APP_NAME}</Text>
        <Feather name="bluetooth" size={22} color={colors.accent} />
      </View>
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
});
