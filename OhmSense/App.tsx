import { StatusBar } from "expo-status-bar";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { BatteryCard } from "./src/components/BatteryCard";
import { BluetoothButton } from "./src/components/BluetoothButton";
import { ConnectionStatus } from "./src/components/ConnectionStatus";
import { ErrorBanner } from "./src/components/ErrorBanner";
import { Header } from "./src/components/Header";
import { MeasureButton } from "./src/components/MeasureButton";
import { ResistanceCard } from "./src/components/ResistanceCard";
import { colors } from "./src/constants/colors";
import {
  BLUETOOTH_BUTTON_LABELS,
  MEASURE_BUTTON_LABELS,
  RESISTANCE_CARD_SUBTITLES,
  spacing,
} from "./src/constants/config";
import { useDeviceState } from "./src/state/useDeviceState";

export default function App() {
  const {
    data,
    connectionState,
    error,
    isBusy,
    canMeasure,
    measure,
    toggleConnection,
  } = useDeviceState();

  const isMeasuring = connectionState === "MEASURING";

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <Header />

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <ConnectionStatus state={connectionState} />

          {error !== null ? <ErrorBanner message={error} /> : null}

          <ResistanceCard
            resistance={data ? data.resistance : null}
            subtitle={RESISTANCE_CARD_SUBTITLES[connectionState]}
            isMeasuring={isMeasuring}
          />

          <BatteryCard
            battery={data ? data.battery : null}
            charging={data ? data.charging : false}
            chargeTime={data ? data.chargeTime : null}
          />

          <View style={styles.actions}>
            <MeasureButton
              label={MEASURE_BUTTON_LABELS[connectionState]}
              onPress={measure}
              disabled={!canMeasure || isBusy}
            />
            <BluetoothButton
              label={BLUETOOTH_BUTTON_LABELS[connectionState]}
              onPress={toggleConnection}
              disabled={false}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  actions: {
    gap: spacing.md,
  },
});
