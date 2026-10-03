import type { ConnectionState, DeviceData } from "../types/device";

export const APP_NAME = "OhmSense";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  card: 20,
  badge: 999,
  button: 16,
} as const;

export const MAX_BATTERY_PERCENT = 100;

/**
 * Which device backend `createDeviceService` builds. "mock" keeps the app
 * runnable in Expo Go and preserves the Phase 2 behaviour exactly; "ble" routes
 * to the real peripheral and requires a development build, because Expo Go
 * cannot load the native BLE module.
 */
export type DeviceServiceMode = "mock" | "ble";

export const deviceServiceMode: DeviceServiceMode = "ble";

export const EMPTY_PLACEHOLDER = "—";

export const ESTADO_LABELS: Record<ConnectionState, string> = {
  DISCONNECTED: "Desconectado",
  SCANNING: "Buscando",
  CONNECTING: "Conectando",
  CONNECTED: "Conectado",
  MEASURING: "Midiendo",
  MEASUREMENT_RECEIVED: "Medición lista",
  ERROR: "Error",
};

export const RESISTANCE_CARD_SUBTITLES: Record<ConnectionState, string> = {
  DISCONNECTED: "Esperando medición...",
  SCANNING: "Esperando medición...",
  CONNECTING: "Esperando medición...",
  CONNECTED: "Listo para medir",
  MEASURING: "Midiendo resistencia...",
  MEASUREMENT_RECEIVED: "Medición completada",
  ERROR: "Esperando medición...",
};

export const MEASURE_BUTTON_LABELS: Record<ConnectionState, string> = {
  DISCONNECTED: "MEDIR",
  SCANNING: "MEDIR",
  CONNECTING: "MEDIR",
  CONNECTED: "MEDIR",
  MEASURING: "MEDIENDO...",
  MEASUREMENT_RECEIVED: "MEDIR",
  ERROR: "MEDIR",
};

export const BLUETOOTH_BUTTON_LABELS: Record<ConnectionState, string> = {
  DISCONNECTED: "CONECTAR BLUETOOTH",
  SCANNING: "ESCANEANDO...",
  CONNECTING: "CONECTANDO...",
  CONNECTED: "DESCONECTAR",
  MEASURING: "DESCONECTAR",
  MEASUREMENT_RECEIVED: "DESCONECTAR",
  ERROR: "REINTENTAR BLUETOOTH",
};

export const resistance = {
  milliOhmThreshold: 1,
  defaultPrecision: 3,
  unitMilliOhm: "mΩ",
  unitOhm: "Ω",
} as const;

export const charging = {
  label: "Cargando",
  notChargingLabel: "Sin carga",
  timeLabel: "Carga restante",
} as const;

export const mock = {
  deviceName: "OhmSense-C3",
  scanDurationMs: 900,
  connectingDurationMs: 900,
  measurementDurationMs: 1100,
  batteryTickMs: 8000,
  resistanceJitter: 0.0004,
  seedData: {
    resistance: 0.007045,
    battery: 78,
    charging: false,
    chargeTime: null,
  } as DeviceData,
  chargingData: {
    resistance: 0.007045,
    battery: 42,
    charging: true,
    chargeTime: 84,
  } as DeviceData,
} as const;
