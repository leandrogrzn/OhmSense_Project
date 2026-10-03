import type { DeviceData } from "../types/device";

export type DeviceDataListener = (data: DeviceData) => void;
export type Unsubscribe = () => void;

export type ConnectionProgressHandler = (phase: "scanning" | "connecting") => void;

/**
 * Something the device did on its own initiative, after `connect()` had
 * already resolved. Without a channel for these, a peripheral dropping
 * mid-session would strand the UI on "Conectado" forever.
 *
 * Both variants map onto actions the reducer already has (DISCONNECTED and
 * FAILED), so the state machine does not grow.
 */
export type DeviceEvent =
  | { type: "DISCONNECTED" }
  | { type: "ERROR"; message: string };

export type DeviceEventHandler = (event: DeviceEvent) => void;

/**
 * Contract every device backend must fulfil, so the application state layer and
 * the UI never learn whether the data comes from a mock or from BLE.
 */
export interface DeviceService {
  getInitialData(): Promise<DeviceData>;
  connect(onProgress?: ConnectionProgressHandler): Promise<void>;
  disconnect(): Promise<void>;
  requestMeasurement(): Promise<DeviceData>;
  subscribe(listener: DeviceDataListener): Unsubscribe;
  setEventHandler(handler: DeviceEventHandler | null): void;
  dispose(): void;
}
