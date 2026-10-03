import { PermissionsAndroid, Platform, type Permission } from "react-native";

/**
 * Android 12 (API 31) replaced the install-time BLUETOOTH / BLUETOOTH_ADMIN
 * permissions with runtime-gated BLUETOOTH_SCAN and BLUETOOTH_CONNECT. Below
 * API 31 the platform exposes BLE scan results through the location API, so
 * location is genuinely mandatory there and is the only case in which it is
 * requested.
 */
const ANDROID_S = 31;

const ANDROID_12_PERMISSIONS = [
  PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
] as const;

const LEGACY_PERMISSIONS = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] as const;

/** The set of permissions this device's platform level actually needs. */
export function getRequiredPermissions(): readonly Permission[] {
  if (Platform.OS !== "android") {
    return [];
  }
  return Platform.Version >= ANDROID_S ? ANDROID_12_PERMISSIONS : LEGACY_PERMISSIONS;
}

export type PermissionOutcome = "granted" | "denied";

/**
 * Requests every missing permission for the current platform level. Already
 * granted permissions are skipped, so a second call is cheap and silent.
 *
 * `neverForLocation: true` is set in the config plugin, which lets the system
 * grant BLUETOOTH_SCAN without the app holding any location permission on
 * Android 12 and above.
 *
 * @returns whether every required permission ended up granted.
 */
export async function requestBlePermissions(): Promise<PermissionOutcome> {
  if (Platform.OS !== "android") {
    // iOS asks for Bluetooth access through the system prompt raised by the
    // first CBCentralManager use, which the BleManager constructor triggers.
    // There is nothing to request proactively.
    return "granted";
  }

  const required = getRequiredPermissions();
  const missing: Permission[] = [];

  for (const permission of required) {
    const alreadyGranted = await PermissionsAndroid.check(permission);
    if (!alreadyGranted) {
      missing.push(permission);
    }
  }

  if (missing.length === 0) {
    return "granted";
  }

  const result = await PermissionsAndroid.requestMultiple(missing);
  const allGranted = missing.every(
    (permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED,
  );

  return allGranted ? "granted" : "denied";
}

/** Human readable reason a permission was refused, for the ERROR state. */
export function permissionDeniedMessage(): string {
  if (Platform.OS !== "android") {
    return "Se denegó el permiso de Bluetooth";
  }
  return Platform.Version >= ANDROID_S
    ? "Se denegaron los permisos de Bluetooth. Actívalos en Ajustes."
    : "Se denegó el permiso de ubicación, necesario para escanear en Android 11 o inferior.";
}
