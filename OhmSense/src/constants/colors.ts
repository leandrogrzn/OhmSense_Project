import type { ConnectionState } from "../types/device";

export const colors = {
  background: "#0A1020",
  surface: "#131B2E",
  surfaceAlt: "#1C2740",
  border: "#253352",
  divider: "#1E2A44",

  accent: "#7DD3FC",
  accentPressed: "#5FB6E8",
  onAccent: "#0A1020",

  textPrimary: "#E8EEF9",
  textSecondary: "#A8B6D1",
  textMuted: "#6B7C9E",

  batteryFill: "#4ADE80",
  batteryTrack: "#1C2740",

  statusDisconnected: "#FB7185",
  statusPending: "#FACC15",
  statusConnected: "#4ADE80",
  statusMeasuring: "#7DD3FC",
  statusError: "#FB7185",
} as const;

export const connectionStateColors: Record<ConnectionState, string> = {
  DISCONNECTED: colors.statusDisconnected,
  SCANNING: colors.statusPending,
  CONNECTING: colors.statusPending,
  CONNECTED: colors.statusConnected,
  MEASURING: colors.statusMeasuring,
  MEASUREMENT_RECEIVED: colors.statusConnected,
  ERROR: colors.statusError,
};
