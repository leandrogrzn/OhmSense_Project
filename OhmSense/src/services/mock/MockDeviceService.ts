import { mock } from "../../constants/config";
import type { DeviceData } from "../../types/device";
import type {
  ConnectionProgressHandler,
  DeviceDataListener,
  DeviceEventHandler,
  DeviceService,
  Unsubscribe,
} from "../types";

export type MockProfile = "default" | "charging";

function clampBattery(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * In-memory stand-in for the ESP32-C3. It reproduces the timings and the
 * notification flow of the real device so that a future BLE service can be
 * swapped in without touching the state layer or the UI.
 */
export class MockDeviceService implements DeviceService {
  private data: DeviceData;
  private listeners = new Set<DeviceDataListener>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private intervals = new Set<ReturnType<typeof setInterval>>();

  constructor(private readonly profile: MockProfile = "default") {
    this.data = { ...this.baseData() };
  }

  private baseData(): DeviceData {
    return this.profile === "charging" ? { ...mock.chargingData } : { ...mock.seedData };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const handle = setTimeout(() => {
        this.timers.delete(handle);
        resolve();
      }, ms);
      this.timers.add(handle);
    });
  }

  async getInitialData(): Promise<DeviceData> {
    return { ...this.data };
  }

  async connect(onProgress?: ConnectionProgressHandler): Promise<void> {
    onProgress?.("scanning");
    await this.sleep(mock.scanDurationMs);

    onProgress?.("connecting");
    await this.sleep(mock.connectingDurationMs);

    this.startBatteryTicker();
  }

  async disconnect(): Promise<void> {
    this.stopBatteryTicker();
  }

  async requestMeasurement(): Promise<DeviceData> {
    await this.sleep(mock.measurementDurationMs);

    const jitter = (Math.random() - 0.5) * 2 * mock.resistanceJitter;
    this.data = {
      ...this.data,
      resistance: Math.max(0, this.data.resistance + jitter),
    };

    this.notify();
    return { ...this.data };
  }

  subscribe(listener: DeviceDataListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setEventHandler(_handler: DeviceEventHandler | null): void {
    // The in-memory device never drops off the air on its own, so it has no
    // unsolicited event to report. The handler is accepted to satisfy the
    // DeviceService contract and is deliberately never invoked.
  }

  dispose(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.stopBatteryTicker();
    this.listeners.clear();
  }

  private startBatteryTicker(): void {
    const handle = setInterval(() => {
      this.data = {
        ...this.data,
        battery: clampBattery(this.data.battery - 1),
        chargeTime:
          this.data.charging && this.data.chargeTime !== null
            ? Math.max(0, this.data.chargeTime - 1)
            : this.data.chargeTime,
      };
      this.notify();
    }, mock.batteryTickMs);

    this.intervals.add(handle);
  }

  private stopBatteryTicker(): void {
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals.clear();
  }

  private notify(): void {
    const snapshot = { ...this.data };
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
