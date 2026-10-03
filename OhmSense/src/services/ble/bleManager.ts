import type { BleManager } from "@sfourdrinier/react-native-ble-plx";

/**
 * The BLE library evaluates `TurboModuleRegistry.getEnforcing('BlePlx')` at
 * module scope, reached from its entry point through BleManager -> BleModule.
 * A top-level value import of the package would therefore throw in any context
 * without the native module, which includes Expo Go and every environment where
 * the app is still running against the mock.
 *
 * Two rules keep mock mode safe:
 *   1. only `import type` from the package, which TypeScript erases entirely;
 *   2. the runtime `require` below is deferred until a manager is genuinely
 *      wanted, so a mock-mode session never evaluates the native module.
 */
let manager: BleManager | null = null;

export function getBleManager(): BleManager {
  if (manager === null) {
    const ble = require("@sfourdrinier/react-native-ble-plx") as typeof import("@sfourdrinier/react-native-ble-plx");
    manager = new ble.BleManager();
  }
  return manager;
}

/** True once a manager has been created, without creating one. */
export function hasBleManager(): boolean {
  return manager !== null;
}

/**
 * Releases the singleton. A later call to {@link getBleManager} builds a fresh
 * one, which is the only supported way to reuse the library after `destroy()`.
 */
export async function destroyBleManager(): Promise<void> {
  if (manager === null) {
    return;
  }
  const current = manager;
  manager = null;
  await current.destroy();
}
