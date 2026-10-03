import { BleDeviceService } from "./ble/BleDeviceService";
import { MockDeviceService, type MockProfile } from "./mock/MockDeviceService";
import { deviceServiceMode } from "../constants/config";
import type { DeviceService } from "./types";

export type { DeviceService } from "./types";

/**
 * Single seam where the device backend is chosen, driven by the
 * `deviceServiceMode` constant in src/constants/config.ts.
 *
 * The BLE backend is imported statically, but it only touches the native
 * module when a manager is actually constructed, which happens inside
 * BleDeviceService.connect(). Mock mode therefore still runs in Expo Go, with
 * no native module present.
 *
 * The profile drives which mock battery scenario is simulated:
 * "default" (discharging) or "charging" (shows charging state and charge time).
 * It is ignored in "ble" mode, where the peripheral decides.
 */
export function createDeviceService(profile: MockProfile = "default"): DeviceService {
  if (deviceServiceMode === "ble") {
    return new BleDeviceService();
  }
  return new MockDeviceService(profile);
}
