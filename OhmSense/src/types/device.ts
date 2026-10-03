export const CONNECTION_STATES = [
  "DISCONNECTED",
  "SCANNING",
  "CONNECTING",
  "CONNECTED",
  "MEASURING",
  "MEASUREMENT_RECEIVED",
  "ERROR",
] as const;

export type ConnectionState = (typeof CONNECTION_STATES)[number];

export interface DeviceData {
  resistance: number;
  battery: number;
  charging: boolean;
  chargeTime: number | null;
}

export interface DeviceState {
  connectionState: ConnectionState;
  data: DeviceData | null;
  error: string | null;
}

export type DeviceAction =
  | { type: "CONNECT_REQUESTED" }
  | { type: "SERVICE_CONNECTING" }
  | { type: "CONNECTED" }
  | { type: "DISCONNECTED" }
  | { type: "MEASURE_REQUESTED" }
  | { type: "MEASUREMENT_RECEIVED"; data: DeviceData }
  | { type: "DATA_UPDATED"; data: DeviceData }
  | { type: "FAILED"; message: string };
