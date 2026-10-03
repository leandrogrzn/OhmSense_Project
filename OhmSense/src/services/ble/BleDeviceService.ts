import { Platform } from "react-native";
import type {
  BleError,
  BleManager,
  Characteristic,
  Device,
  Subscription,
} from "@sfourdrinier/react-native-ble-plx";

import type { DeviceData } from "../../types/device";
import type {
  ConnectionProgressHandler,
  DeviceDataListener,
  DeviceEventHandler,
  DeviceService,
  Unsubscribe,
} from "../types";
import {
  ADVERTISED_DEVICE_NAME,
  COMMAND_CODES,
  CONNECT_TIMEOUT_MS,
  MEASUREMENT_TIMEOUT_MS,
  normaliseUuid,
  OHMSENSE_COMMAND_UUID,
  OHMSENSE_DATA_UUID,
  OHMSENSE_SERVICE_UUID,
  OHMSENSE_STATUS_UUID,
  SCAN_TIMEOUT_MS,
} from "./bleConstants";
import { destroyBleManager, getBleManager } from "./bleManager";
import { permissionDeniedMessage, requestBlePermissions } from "./blePermissions";
import {
  BleParseError,
  decodeBase64,
  encodeBase64,
  parseDataPacket,
  parseStatusPacket,
} from "./bleParser";

interface PendingMeasurement {
  resolve: (data: DeviceData) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** `0x01` encoded once, so the write payload is derived, not hard coded. */
const MEASURE_COMMAND_BASE64 = encodeBase64(Uint8Array.of(COMMAND_CODES.MEASURE));

/** Scanner options from the plan: no UUID filter, duplicates allowed. */
const SCAN_OPTIONS = { allowDuplicates: true, legacyScan: true } as const;

/**
 * 16-bit UUIDs are expanded to 128-bit on the wire, so both the constants and
 * the discovered values are normalised before comparison. A case or expansion
 * mismatch here is the classic false negative.
 */
const CHARACTERISTIC_NAMES: Readonly<Record<string, string>> = {
  [normaliseUuid(OHMSENSE_DATA_UUID)]: "DATA",
  [normaliseUuid(OHMSENSE_COMMAND_UUID)]: "COMMAND",
  [normaliseUuid(OHMSENSE_STATUS_UUID)]: "STATUS",
};

const SERVICE_UUID_NORMALISED = normaliseUuid(OHMSENSE_SERVICE_UUID);

const BLUETOOTH_STATE_MESSAGES: Readonly<Record<string, string>> = {
  PoweredOff: "Bluetooth está apagado. Actívalo e inténtalo de nuevo.",
  Unauthorized: permissionDeniedMessage(),
  Unsupported: "Este dispositivo no admite Bluetooth Low Energy",
};

/**
 * Library error codes rendered in Spanish, keyed by the numeric `errorCode`.
 *
 * The library's own `reason` is English prose meant for its logs, and the app
 * shows its errors to the user, so it is never passed through. An unmapped code
 * keeps only the number, which is enough to look the failure up in ble-plx.
 */
const BLE_ERROR_MESSAGES: Readonly<Record<number, string>> = {
  0: "Error desconocido de Bluetooth",
  1: "El gestor de Bluetooth se cerró",
  2: "La operación se canceló",
  3: "La operación agotó el tiempo de espera",
  4: "No se pudo iniciar la operación",
  100: "Este dispositivo no admite Bluetooth Low Energy",
  101: "Falta el permiso de Bluetooth",
  102: "Bluetooth está apagado",
  103: "El estado de Bluetooth es desconocido",
  104: "Bluetooth se está reiniciando",
  105: "No se pudo comprobar el estado de Bluetooth",
  200: "No se pudo conectar con el dispositivo",
  201: "El dispositivo se desconectó",
  203: "El dispositivo ya está conectado",
  204: "No se encontró el dispositivo",
  205: "El dispositivo no está conectado",
  300: "El dispositivo no respondió al descubrimiento de servicios",
  302: "No se encontró el servicio solicitado en el dispositivo",
  303: "Los servicios del dispositivo no se han descubierto",
  400: "El dispositivo no respondió al descubrimiento de características",
  401: "No se pudo escribir en la característica del dispositivo",
  402: "No se pudo leer la característica del dispositivo",
  403: "Falló la notificación de la característica",
  404: "No se encontró la característica en el dispositivo",
  405: "Las características del dispositivo no se han descubierto",
  600: "No se pudo iniciar el escaneo",
  601: "Los servicios de ubicación están desactivados",
};

const SCAN_NOT_FOUND_MESSAGE = "No se encontró el dispositivo OhmSense";
const SCAN_CANCELLED_MESSAGE = "Se canceló la búsqueda del dispositivo OhmSense";
const ALREADY_CONNECTED_MESSAGE = "Ya está conectado a un dispositivo OhmSense";
const NOT_CONNECTED_MESSAGE = "No hay un dispositivo conectado";
const MEASUREMENT_BUSY_MESSAGE = "Ya hay una medición en curso";
const DISCONNECTED_MESSAGE = "El dispositivo se desconectó";

/** States during which scanning and connecting are still worth attempting. */
function isUsableBluetoothState(state: string): boolean {
  return state === "PoweredOn" || state === "Resetting" || state === "Unknown";
}

/**
 * Rejects an operation that hangs. Android usually surfaces a real error, but a
 * peripheral that stops responding can otherwise leave a promise pending
 * forever with the UI stuck mid-transition.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(message));
      },
    );
  });
}

/**
 * Structural check for a library `BleError`.
 *
 * `instanceof` would need a runtime import of the package, which is exactly
 * what this file avoids: the package's entry point touches the native module at
 * import time. The shape is stable, and anything thrown by the library carries
 * both fields.
 */
function isBleError(error: unknown): error is BleError {
  return error instanceof Error && "errorCode" in error && "reason" in error;
}

function describeError(error: unknown): string {
  if (isBleError(error)) {
    const code = (error as BleError).errorCode;
    if (typeof code !== "number") {
      return "Error de Bluetooth";
    }
    return BLE_ERROR_MESSAGES[code] ?? `Error de Bluetooth (código ${code})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Error de conexión";
}

/**
 * The real backend. It owns every piece of BLE knowledge the application has:
 * permissions, scanning, connection, service discovery, verification,
 * notification decoding and the MEASURE command. It contains no React, no JSX
 * and no knowledge of the reducer or the UI. It reports progress through
 * connect()'s callback, readings through subscribe(), and unsolicited drops and
 * fatal states through setEventHandler().
 */
export class BleDeviceService implements DeviceService {
  private device: Device | null = null;
  private dataCharacteristic: Characteristic | null = null;
  private commandCharacteristic: Characteristic | null = null;
  private statusCharacteristic: Characteristic | null = null;

  private dataSubscription: Subscription | null = null;
  private statusSubscription: Subscription | null = null;
  private disconnectSubscription: Subscription | null = null;
  private poweredStateSubscription: Subscription | null = null;

  private listeners = new Set<DeviceDataListener>();
  private eventHandler: DeviceEventHandler | null = null;
  private pendingMeasurement: PendingMeasurement | null = null;
  private latestData: DeviceData | null = null;

  /** Incremented on every attempt, disconnect and teardown; stale callbacks match nothing. */
  private generation = 0;
  private disposed = false;
  /** Suppresses the device listeners while we are deliberately tearing down. */
  private closing = false;
  private isConnected = false;

  /** Manager backing the current attempt, kept so a scan can always be stopped. */
  private activeManager: BleManager | null = null;
  /** Settles the in-flight scan and stops the radio; null when no scan is running. */
  private cancelScan: (() => Promise<void>) | null = null;

  /**
   * `managerOverride` exists so the teardown paths can be exercised against a
   * double without a native adapter. Production callers pass nothing and get the
   * lazily built singleton, so `createDeviceService()` is unchanged and the
   * public `DeviceService` contract is untouched.
   */
  constructor(private readonly managerOverride: BleManager | null = null) {}

  private manager(): BleManager {
    return this.managerOverride ?? getBleManager();
  }

  /** Releases whichever manager this service owns, injected or singleton. */
  private async destroyManager(): Promise<void> {
    if (this.managerOverride !== null) {
      await this.managerOverride.destroy();
      return;
    }
    await destroyBleManager();
  }

  async getInitialData(): Promise<DeviceData> {
    if (this.latestData !== null) {
      return { ...this.latestData };
    }
    throw new Error("Sin datos del dispositivo: conéctate primero");
  }

  async connect(onProgress?: ConnectionProgressHandler): Promise<void> {
    if (this.disposed) {
      throw new Error("El servicio BLE fue liberado");
    }
    if (this.isConnected) {
      throw new Error(ALREADY_CONNECTED_MESSAGE);
    }

    const attempt = (this.generation += 1);
    const isStale = () => attempt !== this.generation;
    const manager = this.manager();
    this.activeManager = manager;

    // Both checks run before the watchdog is armed. The adapter state needs no
    // permission to read, and the permission dialog is user-facing: counting
    // the seconds the user spends on it would make a slow answer on the first
    // run look like a connection timeout instead of the real outcome.
    await this.assertPoweredOn(manager);
    await this.requestPermissions();

    if (isStale()) {
      return;
    }

    // Bluetooth being switched off mid-attempt has to reject the attempt. This
    // guard, and a backstop watchdog, race the real work below.
    let rejectLost: (error: Error) => void = () => undefined;
    const lost = new Promise<never>((_, reject) => {
      rejectLost = reject;
    });

    const guardSubscription = manager.onStateChange((state) => {
      if (isUsableBluetoothState(state)) {
        return;
      }
      rejectLost(new Error(BLUETOOTH_STATE_MESSAGES[state] ?? `Bluetooth no está disponible (${state})`));
    });
    const watchdog = setTimeout(
      () => rejectLost(new Error("La conexión con el dispositivo OhmSense tardó demasiado")),
      CONNECT_TIMEOUT_MS,
    );

    try {
      await Promise.race([this.runConnectAttempt(manager, onProgress, isStale), lost]);
    } catch (error) {
      // Any failure between connection and subscription must leave nothing
      // behind: the GATT link, the disconnect listener and the characteristic
      // references all die here, so the next attempt starts from a clean
      // service. A stale attempt is skipped on purpose, because by then a newer
      // attempt (or an explicit disconnect) owns this state.
      if (!isStale() && !this.disposed) {
        await this.teardown();
      }
      throw error;
    } finally {
      await this.stopScanQuietly();
      guardSubscription.remove();
      clearTimeout(watchdog);
    }
  }

  async disconnect(): Promise<void> {
    this.generation += 1;
    await this.teardown();
  }

  async requestMeasurement(): Promise<DeviceData> {
    const command = this.commandCharacteristic;
    if (!this.isConnected || command === null) {
      throw new Error(NOT_CONNECTED_MESSAGE);
    }
    if (this.pendingMeasurement !== null) {
      throw new Error(MEASUREMENT_BUSY_MESSAGE);
    }

    await command.writeWithResponse(MEASURE_COMMAND_BASE64);

    // The write carries no reading. The promise is settled by the DATA
    // notification that follows, or by STATUS === ERROR.
    return new Promise<DeviceData>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingMeasurement = null;
        reject(new Error("El dispositivo no respondió la medición a tiempo"));
      }, MEASUREMENT_TIMEOUT_MS);

      this.pendingMeasurement = { resolve, reject, timer };
    });
  }

  subscribe(listener: DeviceDataListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setEventHandler(handler: DeviceEventHandler | null): void {
    this.eventHandler = handler;
  }

  /**
   * Idempotent: React 18/19 StrictMode double-invokes effects in development, and
   * calling it again on an already released service is a no-op rather than an
   * error or a second teardown.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.generation += 1;
    this.closing = true;

    this.rejectPendingMeasurement("El servicio BLE fue liberado");

    // Captured before anything can clear it: `forgetDevice()` nulls the field,
    // so reading it afterwards would leave `cancelConnection` unreachable.
    const device = this.device;

    this.clearSubscriptions();
    this.forgetDevice();
    this.listeners.clear();
    this.eventHandler = null;

    // A scan this service started must not outlive it. `cancelActiveScan` stops
    // the radio synchronously and settles the pending promise.
    void this.cancelActiveScan();
    this.activeManager = null;

    if (device !== null) {
      // `cancelConnection` is the library's single teardown call: it
      // disconnects a live link and cancels a pending one alike.
      void device.cancelConnection().catch(() => undefined);
    }

    void this.destroyManager().catch(() => undefined);
  }

  private async runConnectAttempt(
    manager: BleManager,
    onProgress: ConnectionProgressHandler | undefined,
    isStale: () => boolean,
  ): Promise<void> {
    if (isStale()) {
      return;
    }

    const device = await this.scanForDevice(manager, onProgress);
    if (isStale() || device === null) {
      return;
    }

    onProgress?.("connecting");

    this.device = device;
    this.closing = false;

    // A peripheral that walks out of range or powers off mid-session must reach
    // the UI; nothing else in this flow is able to report it.
    this.disconnectSubscription = device.onDisconnected((error) => {
      if (this.closing || this.disposed || isStale()) {
        return;
      }
      this.handleUnsolicitedDisconnect(error);
    });

    await this.discoverAndVerify(device);
    if (isStale()) {
      return;
    }

    this.attachSubscriptions();
    this.watchPoweredState(manager);
    this.isConnected = true;
  }

  private async assertPoweredOn(manager: BleManager): Promise<void> {
    const state = await manager.state();
    if (state === "PoweredOn") {
      return;
    }
    throw new Error(BLUETOOTH_STATE_MESSAGES[state] ?? `Bluetooth no está disponible (${state})`);
  }

  private async requestPermissions(): Promise<void> {
    if ((await requestBlePermissions()) === "denied") {
      throw new Error(permissionDeniedMessage());
    }
  }

  private scanForDevice(
    manager: BleManager,
    onProgress: ConnectionProgressHandler | undefined,
  ): Promise<Device | null> {
    onProgress?.("scanning");

    return new Promise<Device | null>((resolve, reject) => {
      let settled = false;
      let connectAttempted = false;

      const finish = (found: Device) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.cancelScan = null;
        resolve(found);
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.cancelScan = null;
        reject(error instanceof Error ? error : new Error(describeError(error)));
      };

      const timer = setTimeout(() => fail(new Error(SCAN_NOT_FOUND_MESSAGE)), SCAN_TIMEOUT_MS);

      // Cancellation has to reach the adapter, not just the promise: the radio
      // would otherwise keep scanning for the rest of SCAN_TIMEOUT_MS with no
      // consumer left on this promise. Stopping it before settling keeps the
      // scan count at zero, so a following attempt starts from a clean adapter.
      this.cancelScan = async () => {
        await manager.stopDeviceScan().catch(() => undefined);
        fail(new Error(SCAN_CANCELLED_MESSAGE));
      };

      manager
        .startDeviceScan(null, SCAN_OPTIONS, (error, candidate) => {
          if (error !== null) {
            fail(new Error(`Falló el escaneo: ${describeError(error)}`));
            return;
          }
          if (candidate === null || connectAttempted) {
            return;
          }
          // Android commonly populates only localName from the advertising
          // packet, so both fields are checked. The name is the primary filter:
          // the scan is deliberately unfiltered by service UUID.
          if (
            candidate.name !== ADVERTISED_DEVICE_NAME &&
            candidate.localName !== ADVERTISED_DEVICE_NAME
          ) {
            return;
          }

          // Stop on the first match, and remember it, so a duplicate
          // advertisement cannot start a second connection.
          connectAttempted = true;
          void manager.stopDeviceScan().catch(() => undefined);
          finish(candidate);
        })
        .catch(fail);
    });
  }

  /**
   * Stops an in-flight scan and settles its promise. Safe to call when no scan
   * is running, and safe to call twice: the handle is dropped before it is used,
   * so a concurrent cancel cannot double-stop the adapter.
   */
  private async cancelActiveScan(): Promise<void> {
    const cancel = this.cancelScan;
    this.cancelScan = null;
    if (cancel === null) {
      return;
    }
    await cancel();
  }

  private async discoverAndVerify(device: Device): Promise<void> {
    try {
      const connected = await withTimeout(
        device.connect(),
        CONNECT_TIMEOUT_MS,
        "No se pudo conectar con el dispositivo OhmSense",
      );
      await withTimeout(
        connected.discoverAllServicesAndCharacteristics(),
        CONNECT_TIMEOUT_MS,
        "El dispositivo OhmSense no respondió al descubrimiento de servicios",
      );
    } catch (error) {
      throw error instanceof Error ? error : new Error(describeError(error));
    }

    const service = (await device.services()).find(
      (candidate) => normaliseUuid(candidate.uuid) === SERVICE_UUID_NORMALISED,
    );
    if (service === undefined) {
      throw new Error(
        "El dispositivo no expone el servicio OhmSense: el firmware no coincide con la app",
      );
    }

    const characteristics = await service.characteristics();
    const byName = new Map<string, Characteristic>();
    for (const characteristic of characteristics) {
      const name = CHARACTERISTIC_NAMES[normaliseUuid(characteristic.uuid)];
      if (name !== undefined) {
        byName.set(name, characteristic);
      }
    }

    // Each missing element is named on its own, so the ERROR state can say
    // exactly which piece of the protocol the firmware is missing.
    const data = byName.get("DATA");
    if (data === undefined) {
      throw new Error("El servicio OhmSense no expone la característica DATA");
    }
    const command = byName.get("COMMAND");
    if (command === undefined) {
      throw new Error("El servicio OhmSense no expone la característica COMMAND");
    }
    const status = byName.get("STATUS");
    if (status === undefined) {
      throw new Error("El servicio OhmSense no expone la característica STATUS");
    }

    if (Platform.OS === "android" && !data.isNotifiable) {
      throw new Error("La característica DATA del firmware no admite notificaciones");
    }
    if (Platform.OS === "android" && !command.isWritableWithResponse) {
      throw new Error("La característica COMMAND del firmware no admite escritura con respuesta");
    }

    this.dataCharacteristic = data;
    this.commandCharacteristic = command;
    this.statusCharacteristic = status;
  }

  private attachSubscriptions(): void {
    const data = this.dataCharacteristic;
    const status = this.statusCharacteristic;

    if (data !== null) {
      this.dataSubscription = data.monitor((error, characteristic) => {
        if (error !== null || characteristic?.value == null) {
          return;
        }
        this.handleDataNotification(characteristic.value);
      });
    }

    if (status !== null) {
      this.statusSubscription = status.monitor((error, characteristic) => {
        if (error !== null || characteristic?.value == null) {
          return;
        }
        this.handleStatusNotification(characteristic.value);
      });
    }
  }

  /**
   * Losing Bluetooth while a session is up is fatal rather than a clean drop:
   * the peripheral is fine, so the user has to be told to turn it back on.
   */
  private watchPoweredState(manager: BleManager): void {
    this.poweredStateSubscription = manager.onStateChange((state) => {
      if (this.closing || this.disposed || isUsableBluetoothState(state)) {
        return;
      }
      this.handleFatalState(BLUETOOTH_STATE_MESSAGES[state] ?? `Bluetooth no está disponible (${state})`);
    });
  }

  private handleDataNotification(base64: string): void {
    let data: DeviceData;
    try {
      data = parseDataPacket(decodeBase64(base64));
    } catch (error) {
      // A malformed packet is logged and dropped: it must never crash the app
      // nor poison the state machine.
      if (error instanceof BleParseError) {
        console.warn("[OhmSense] Paquete DATA descartado:", error.message);
      }
      return;
    }

    this.latestData = data;

    const pending = this.pendingMeasurement;
    if (pending !== null) {
      this.pendingMeasurement = null;
      clearTimeout(pending.timer);
      pending.resolve(data);
      return;
    }

    this.notifyListeners(data);
  }

  private handleStatusNotification(base64: string): void {
    let status: string;
    try {
      status = parseStatusPacket(decodeBase64(base64));
    } catch (error) {
      if (error instanceof BleParseError) {
        console.warn("[OhmSense] Paquete STATUS descartado:", error.message);
      }
      return;
    }

    if (status === "ERROR") {
      this.rejectPendingMeasurement("El dispositivo no pudo completar la medición");
    }
    // MEASURING and READY only confirm what the UI already shows, and
    // RESULT_READY is informational: the DATA notification is what resolves a
    // measurement. No status may touch the state machine directly.
  }

  private notifyListeners(data: DeviceData): void {
    const snapshot = { ...data };
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private rejectPendingMeasurement(message: string): void {
    const pending = this.pendingMeasurement;
    if (pending === null) {
      return;
    }
    this.pendingMeasurement = null;
    clearTimeout(pending.timer);
    pending.reject(new Error(message));
  }

  private handleUnsolicitedDisconnect(error: BleError | null): void {
    this.generation += 1;

    if (error !== null) {
      console.warn("[OhmSense] Desconexión no solicitada:", error.reason, error.errorCode);
    }

    this.releaseConnection(DISCONNECTED_MESSAGE);
    this.eventHandler?.({ type: "DISCONNECTED" });
  }

  private handleFatalState(message: string): void {
    this.generation += 1;

    this.releaseConnection(message);
    this.eventHandler?.({ type: "ERROR", message });
  }

  /** Drops the link and everything bound to it, reporting `message` to any waiter. */
  private releaseConnection(message: string): void {
    this.isConnected = false;
    this.rejectPendingMeasurement(message);
    this.clearSubscriptions();
    this.forgetDevice();
  }

  private async teardown(): Promise<void> {
    this.closing = true;

    // A scan must die before the device reference is examined: while scanning
    // there is no device yet, and returning early on that basis would leave the
    // adapter scanning with nobody listening.
    await this.cancelActiveScan();

    const device = this.device;
    this.releaseConnection("La conexión se cerró");
    if (device === null) {
      return;
    }

    try {
      // `cancelConnection` is the library's single teardown call: it
      // disconnects a live link and cancels a pending one alike, so there is
      // no need to distinguish the two.
      await device.cancelConnection();
    } catch (error) {
      if (isBleError(error)) {
        console.warn("[OhmSense] Error al desconectar:", error.reason, error.errorCode);
      }
    }
  }

  private clearSubscriptions(): void {
    this.dataSubscription?.remove();
    this.dataSubscription = null;
    this.statusSubscription?.remove();
    this.statusSubscription = null;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    this.poweredStateSubscription?.remove();
    this.poweredStateSubscription = null;
  }

  private forgetDevice(): void {
    this.device = null;
    this.dataCharacteristic = null;
    this.commandCharacteristic = null;
    this.statusCharacteristic = null;
  }

  private async stopScanQuietly(): Promise<void> {
    // The manager that started the scan, not whatever the singleton holds now:
    // it is the one whose radio has to be silenced.
    const manager = this.activeManager;
    if (manager === null) {
      return;
    }
    await manager.stopDeviceScan().catch(() => undefined);
  }
}
