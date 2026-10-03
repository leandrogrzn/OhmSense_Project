/**
 * `test`/`expect` are imported rather than used as globals: a file that imports
 * anything from `bun:test` (needed here for `mock.module`) stops receiving the
 * implicit globals. The types come from src/types/bun-test.d.ts, so this still
 * needs no bun type package and no tsconfig change.
 */
import { expect, mock, test } from "bun:test";

import type {
  BleManager,
  Characteristic,
  Device,
  Service,
  Subscription,
} from "@sfourdrinier/react-native-ble-plx";

import type { DeviceData } from "../../types/device";

/**
 * `react-native` cannot be loaded outside a React Native runtime (it throws while
 * parsing its Flow sources), and BleDeviceService reaches it both directly and
 * through blePermissions. Stubbing it is the only thing mocked here: every line
 * of BleDeviceService exercised below is the real code, driven by doubles that
 * mirror the library surface it actually calls.
 */
mock.module("react-native", () => ({
  Platform: { OS: "android", Version: 33 },
  PermissionsAndroid: {
    PERMISSIONS: {
      BLUETOOTH_SCAN: "android.permission.BLUETOOTH_SCAN",
      BLUETOOTH_CONNECT: "android.permission.BLUETOOTH_CONNECT",
      ACCESS_FINE_LOCATION: "android.permission.ACCESS_FINE_LOCATION",
    },
    RESULTS: { GRANTED: "granted", DENIED: "denied" },
    check: async () => true,
    requestMultiple: async () => ({}),
  },
}));

// Imported after the stub, so the module graph resolves react-native to it.
const { BleDeviceService } = await import("./BleDeviceService");

// ---------------------------------------------------------------------------
// Protocol literals, copied from the OhmSense v1.0 spec.
// ---------------------------------------------------------------------------

const SERVICE_UUID = "7b4f1000-6a5e-4d91-9c2a-8f4e5b3d2101";
const DATA_UUID = "7b4f1001-6a5e-4d91-9c2a-8f4e5b3d2101";
const COMMAND_UUID = "7b4f1002-6a5e-4d91-9c2a-8f4e5b3d2101";
const STATUS_UUID = "7b4f1003-6a5e-4d91-9c2a-8f4e5b3d2101";

/** An unrelated adopted service UUID: what a non-OhmSense peripheral looks like. */
const FOREIGN_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";

const DEVICE_NAME = "OhmSense";

/** DATA: 7505 µΩ, 77 %, not charging, no charge time. */
const FIRST_READING_BASE64 = "AVEdAABNAAAA";
/** DATA: 1234408 µΩ (1.234408 Ω), 87 %, charging, 84 min. */
const SECOND_READING_BASE64 = "AejVEgBXAVQA";

const FIRST_READING: DeviceData = {
  resistance: 0.007505,
  battery: 77,
  charging: false,
  chargeTime: null,
};

const SECOND_READING: DeviceData = {
  resistance: 1.234408,
  battery: 87,
  charging: true,
  chargeTime: 84,
};

// ---------------------------------------------------------------------------
// Doubles
// ---------------------------------------------------------------------------

class FakeSubscription {
  removed = 0;

  remove(): void {
    this.removed += 1;
  }
}

function asSubscription(subscription: FakeSubscription): Subscription {
  return subscription as unknown as Subscription;
}

interface FakeCharacteristicOptions {
  uuid: string;
  notifiable?: boolean;
  writableWithResponse?: boolean;
  /** Called when the app writes this characteristic, as a peripheral reacts. */
  onWrite?: (value: string) => void;
}

class FakeCharacteristic {
  readonly isNotifiable: boolean;
  readonly isWritableWithResponse: boolean;
  readonly isWritableWithoutResponse = false;
  readonly isReadable = true;
  readonly monitors: FakeSubscription[] = [];
  readonly written: string[] = [];

  private readonly listeners: ((error: unknown, characteristic: unknown) => void)[] = [];

  constructor(private readonly options: FakeCharacteristicOptions) {
    this.isNotifiable = options.notifiable ?? true;
    this.isWritableWithResponse = options.writableWithResponse ?? true;
  }

  get uuid(): string {
    return this.options.uuid;
  }

  monitor(listener: (error: unknown, characteristic: unknown) => void): Subscription {
    this.listeners.push(listener);
    const subscription = new FakeSubscription();
    this.monitors.push(subscription);
    return asSubscription(subscription);
  }

  writeWithResponse(value: string): Promise<unknown> {
    this.written.push(value);
    this.options.onWrite?.(value);
    return Promise.resolve(this);
  }

  /** Delivers a notification the way the library does: as base64 in `value`. */
  emit(base64: string): void {
    for (const listener of this.listeners) {
      listener(null, { uuid: this.uuid, value: base64 });
    }
  }

  asCharacteristic(): Characteristic {
    return this as unknown as Characteristic;
  }
}

class FakeService {
  readonly uuid: string;
  private readonly entries: FakeCharacteristic[];

  constructor(uuid: string, entries: FakeCharacteristic[]) {
    this.uuid = uuid;
    this.entries = entries;
  }

  asService(): Service {
    return this as unknown as Service;
  }

  /** Mirrors `Service.characteristics()` from the library. */
  characteristics(): Promise<Characteristic[]> {
    return Promise.resolve(this.entries.map((c) => c.asCharacteristic()));
  }
}

/**
 * The advertisement object the scanner hands over and the connected device are
 * the same instance in the real library, so this double plays both roles.
 */
interface FakeDeviceOptions {
  services: FakeService[];
  name?: string;
  localName?: string;
  /** Rejects `connect()`. */
  connectError?: Error;
  /** Rejects `discoverAllServicesAndCharacteristics()`. */
  discoveryError?: Error;
}

class FakeDevice {
  readonly name: string;
  readonly localName: string;
  connectCount = 0;
  discoveryCount = 0;
  cancelConnectionCount = 0;
  readonly disconnectSubscriptions: FakeSubscription[] = [];

  private readonly disconnectListeners: ((error: unknown) => void)[] = [];

  constructor(private readonly options: FakeDeviceOptions) {
    this.name = options.name ?? DEVICE_NAME;
    this.localName = options.localName ?? DEVICE_NAME;
  }

  connect(): Promise<unknown> {
    this.connectCount += 1;
    if (this.options.connectError !== undefined) {
      return Promise.reject(this.options.connectError);
    }
    return Promise.resolve(this);
  }

  discoverAllServicesAndCharacteristics(): Promise<unknown> {
    this.discoveryCount += 1;
    if (this.options.discoveryError !== undefined) {
      return Promise.reject(this.options.discoveryError);
    }
    return Promise.resolve(this);
  }

  services(): Promise<Service[]> {
    return Promise.resolve(this.options.services.map((s) => s.asService()));
  }

  onDisconnected(listener: (error: unknown) => void): Subscription {
    this.disconnectListeners.push(listener);
    const subscription = new FakeSubscription();
    this.disconnectSubscriptions.push(subscription);
    return asSubscription(subscription);
  }

  cancelConnection(): Promise<unknown> {
    this.cancelConnectionCount += 1;
    return Promise.resolve(this);
  }

  emitDisconnected(error: unknown = null): void {
    for (const listener of this.disconnectListeners) {
      listener(error);
    }
  }

  asDevice(): Device {
    return this as unknown as Device;
  }
}

interface FakeManagerOptions {
  state?: string;
  /** The peripheral this scan will advertise. */
  nextDevice: () => FakeDevice;
  /**
   * false never advertises (the scan stays pending), true always does, and a
   * number advertises from that 1-based scan onwards.
   */
  advertise?: boolean | number;
}

class FakeManager {
  scansStarted = 0;
  scansStopped = 0;
  destroyed = 0;
  readonly stateSubscriptions: FakeSubscription[] = [];

  private readonly stateListeners: ((state: string) => void)[] = [];

  constructor(private readonly options: FakeManagerOptions) {}

  state(): Promise<string> {
    return Promise.resolve(this.options.state ?? "PoweredOn");
  }

  onStateChange(listener: (state: string) => void): Subscription {
    this.stateListeners.push(listener);
    const subscription = new FakeSubscription();
    this.stateSubscriptions.push(subscription);
    return asSubscription(subscription);
  }

  startDeviceScan(
    _uuids: unknown,
    _scanOptions: unknown,
    listener: (error: unknown, device: unknown) => void,
  ): Promise<void> {
    this.scansStarted += 1;

    const advertise = this.options.advertise ?? true;
    const shouldAdvertise =
      advertise === true ||
      (typeof advertise === "number" && this.scansStarted >= advertise);

    if (shouldAdvertise) {
      const device = this.options.nextDevice();
      // A real advertisement arrives on a later turn of the event loop, never
      // synchronously inside startDeviceScan.
      setTimeout(() => listener(null, device.asDevice()), 0);
    }

    return Promise.resolve();
  }

  stopDeviceScan(): Promise<void> {
    this.scansStopped += 1;
    return Promise.resolve();
  }

  destroy(): Promise<void> {
    this.destroyed += 1;
    return Promise.resolve();
  }

  emitState(state: string): void {
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  asManager(): BleManager {
    return this as unknown as BleManager;
  }
}

// ---------------------------------------------------------------------------
// Peripheral and service builders
// ---------------------------------------------------------------------------

interface Peripheral {
  device: FakeDevice;
  data: FakeCharacteristic;
  command: FakeCharacteristic;
  status: FakeCharacteristic;
}

interface PeripheralFactoryOptions {
  /** false models a peripheral that accepts MEASURE but never answers it. */
  autoAnswer?: boolean;
}

/** A peripheral exposing exactly the OhmSense v1.0 GATT layout. */
function createOhmSensePeripheral(
  overrides: Partial<FakeDeviceOptions> = {},
  options: PeripheralFactoryOptions = {},
): Peripheral {
  let data!: FakeCharacteristic;

  const command = new FakeCharacteristic({
    uuid: COMMAND_UUID,
    onWrite: () => {
      if (options.autoAnswer === false) {
        return;
      }
      // A peripheral answers MEASURE with a DATA notification on a later turn.
      // The timer matters: the service registers its pending measurement only
      // after the write resolves, so a synchronous answer would be mistaken for
      // an unsolicited update.
      setTimeout(() => data.emit(FIRST_READING_BASE64), 0);
    },
  });

  data = new FakeCharacteristic({ uuid: DATA_UUID });
  const status = new FakeCharacteristic({ uuid: STATUS_UUID });

  const device = new FakeDevice({
    services: [new FakeService(SERVICE_UUID, [data, command, status])],
    ...overrides,
  });

  return { device, data, command, status };
}

/** Hands out one peripheral per scan, so a retry sees a fresh device. */
function managerFor(
  peripherals: Peripheral[],
  options: Partial<FakeManagerOptions> = {},
): FakeManager {
  let index = 0;
  return new FakeManager({
    ...options,
    nextDevice: () => {
      const peripheral = peripherals[Math.min(index, peripherals.length - 1)];
      index += 1;
      return peripheral.device;
    },
  });
}

interface Session {
  service: InstanceType<typeof BleDeviceService>;
  manager: FakeManager;
  peripheral: Peripheral;
}

interface SessionOptions {
  /** How the manager's scans advertise. */
  scan?: Partial<FakeManagerOptions>;
  /** Overrides for the peripheral's device itself (firmware defects, wrong name). */
  device?: Partial<FakeDeviceOptions>;
  /** Overrides for the peripheral's GATT behaviour. */
  peripheral?: PeripheralFactoryOptions;
}

/**
 * A fresh service bound to a manager serving one healthy OhmSense peripheral.
 * Every test builds its own, so the call counters on the doubles never leak
 * between tests and no shared mutable fixture is needed.
 */
function session(options: SessionOptions = {}): Session {
  const peripheral = createOhmSensePeripheral(options.device, options.peripheral);
  const manager = managerFor([peripheral], options.scan);
  return { service: createService(manager), manager, peripheral };
}

function createService(manager: FakeManager): InstanceType<typeof BleDeviceService> {
  return new BleDeviceService(manager.asManager());
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/** Lets the service reach its first `await` boundary before the test acts. */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Fails instead of hanging, so a promise that never settles is a red test. */
async function withDeadline<T>(promise: Promise<T>, ms = 1000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`La promesa no se resolvió en ${ms} ms`)),
      ms,
    );
  });

  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function expectRejection(
  promise: Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await withDeadline(promise);
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toBe(expectedMessage);
    return;
  }
  throw new Error(`Se esperaba el fallo "${expectedMessage}" pero la promesa resolvió`);
}

function expectAllRemoved(subscriptions: FakeSubscription[]): void {
  for (const subscription of subscriptions) {
    expect(subscription.removed).toBe(1);
  }
}

/**
 * `stopDeviceScan()` runs once when the scan matches and once more from
 * connect()'s `finally`; the library treats the redundant call as a no-op. What
 * these tests care about is that the radio got silenced, not how many calls it
 * took.
 */
function expectScanStopped(manager: FakeManager): void {
  expect(manager.scansStopped).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------\r
// Happy path: the cleanup changes must not have disturbed the normal flow
// ---------------------------------------------------------------------------

test("connect() completes scan -> connect -> discover -> verify -> subscribe", async () => {
  const { service, manager, peripheral } = session();

  const phases: string[] = [];
  await withDeadline(service.connect((phase) => phases.push(phase)));

  expect(phases).toEqual(["scanning", "connecting"]);
  expect(peripheral.device.connectCount).toBe(1);
  expect(peripheral.device.discoveryCount).toBe(1);
  expect(peripheral.data.monitors).toHaveLength(1);
  expect(peripheral.status.monitors).toHaveLength(1);
  expectScanStopped(manager);

  service.dispose();
});

test("the MEASURE command is written as 0x01 and the DATA notification settles the reading", async () => {
  const { service, peripheral } = session();

  await withDeadline(service.connect());
  const reading = await withDeadline(service.requestMeasurement());

  expect(peripheral.command.written).toEqual(["AQ=="]);
  expect(reading).toEqual(FIRST_READING);

  service.dispose();
});

// ---------------------------------------------------------------------------
// Problem 2: a failed connect must not leave the GATT link open
// ---------------------------------------------------------------------------

test("connect() that fails during discovery cancels the link and clears its listeners", async () => {
  const { service, manager, peripheral } = session({
    device: { discoveryError: new Error("No se pudo descubrir") },
  });

  await expectRejection(service.connect(), "No se pudo descubrir");

  expect(peripheral.device.cancelConnectionCount).toBe(1);
  expectAllRemoved(peripheral.device.disconnectSubscriptions);
  expectAllRemoved(manager.stateSubscriptions);
  // The teardown had to stop the scan, not wait out the 10s timeout.
  expectScanStopped(manager);

  service.dispose();
});

test("connect() that fails because the service does not match cancels the link", async () => {
  // The exact failure the audit reported: a peripheral whose GATT layout is not
  // OhmSense v1.0. It must be rejected AND left disconnected.
  const { service, manager, peripheral } = session({
    device: { services: [new FakeService(FOREIGN_SERVICE_UUID, [])] },
  });

  await expectRejection(
    service.connect(),
    "El dispositivo no expone el servicio OhmSense: el firmware no coincide con la app",
  );

  expect(peripheral.device.cancelConnectionCount).toBe(1);
  expectAllRemoved(peripheral.device.disconnectSubscriptions);
  expectAllRemoved(manager.stateSubscriptions);

  service.dispose();
});

test("connect() that fails during verification cancels the link", async () => {
  const { service, manager, peripheral } = session({
    device: { services: [new FakeService(SERVICE_UUID, [])] },
  });

  await expectRejection(
    service.connect(),
    "El servicio OhmSense no expone la característica DATA",
  );

  expect(peripheral.device.cancelConnectionCount).toBe(1);
  expectAllRemoved(peripheral.device.disconnectSubscriptions);

  service.dispose();
});

test("connect() that finds a non-notifiable DATA names the firmware defect", async () => {
  const { service, peripheral } = session({
    device: {
      services: [
        new FakeService(SERVICE_UUID, [
          new FakeCharacteristic({ uuid: DATA_UUID, notifiable: false }),
          new FakeCharacteristic({ uuid: COMMAND_UUID }),
          new FakeCharacteristic({ uuid: STATUS_UUID }),
        ]),
      ],
    },
  });

  await expectRejection(
    service.connect(),
    "La característica DATA del firmware no admite notificaciones",
  );
  expect(peripheral.device.cancelConnectionCount).toBe(1);

  service.dispose();
});

test("connect() that finds a write-only COMMAND names the firmware defect", async () => {
  const { service, peripheral } = session({
    device: {
      services: [
        new FakeService(SERVICE_UUID, [
          new FakeCharacteristic({ uuid: DATA_UUID }),
          new FakeCharacteristic({ uuid: COMMAND_UUID, writableWithResponse: false }),
          new FakeCharacteristic({ uuid: STATUS_UUID }),
        ]),
      ],
    },
  });

  await expectRejection(
    service.connect(),
    "La característica COMMAND del firmware no admite escritura con respuesta",
  );
  expect(peripheral.device.cancelConnectionCount).toBe(1);

  service.dispose();
});

test("a failed connect leaves the service usable: the next attempt succeeds cleanly", async () => {
  // The first scan advertises a peripheral with the wrong GATT layout, the
  // second a healthy one: the retry must recover rather than stay poisoned.
  const broken = createOhmSensePeripheral({
    services: [new FakeService(FOREIGN_SERVICE_UUID, [])],
  });
  const healthy = createOhmSensePeripheral();
  const manager = managerFor([broken, healthy]);
  const service = createService(manager);

  await expectRejection(
    service.connect(),
    "El dispositivo no expone el servicio OhmSense: el firmware no coincide con la app",
  );
  expect(broken.device.cancelConnectionCount).toBe(1);

  // Nothing left over from the failed attempt may block the retry.
  await withDeadline(service.connect());

  expect(healthy.device.connectCount).toBe(1);
  expect(healthy.device.cancelConnectionCount).toBe(0);
  expect(healthy.data.monitors).toHaveLength(1);
  expect(healthy.status.monitors).toHaveLength(1);
  expect(manager.scansStarted).toBe(2);
  // Exactly one listener per attempt: the failed one did not survive to double up.
  expectAllRemoved(broken.device.disconnectSubscriptions);

  const reading = await withDeadline(service.requestMeasurement());
  expect(reading).toEqual(FIRST_READING);

  service.dispose();
});

// ---------------------------------------------------------------------------
// Problem 4: cancelling a scan must stop the radio
// ---------------------------------------------------------------------------

test("disconnect() during SCANNING stops the scan immediately and settles connect()", async () => {
  // The peripheral never advertises, so the scan stays pending until cancelled.
  const { service, manager, peripheral } = session({ scan: { advertise: false } });

  const connecting = service.connect();
  await nextTurn();

  expect(manager.scansStarted).toBe(1);
  expect(manager.scansStopped).toBe(0);

  await withDeadline(service.disconnect());

  // The radio is silenced on cancel, not left to expire on its 10s timeout.
  expectScanStopped(manager);

  // The pending connect() settles promptly instead of hanging for 10s.
  await expectRejection(connecting, "Se canceló la búsqueda del dispositivo OhmSense");
  expect(peripheral.device.connectCount).toBe(0);

  service.dispose();
});

test("a cancelled scan leaves no scan running, so the next attempt starts clean", async () => {
  // Nothing advertises on the first scan, so it can only end by being cancelled.
  // The retry then finds the peripheral, proving the first scan left nothing
  // behind on the adapter.
  const { service, manager, peripheral: healthy } = session({ scan: { advertise: 2 } });

  const abandoned = service.connect();
  await nextTurn();
  await withDeadline(service.disconnect());
  await expectRejection(abandoned, "Se canceló la búsqueda del dispositivo OhmSense");
  expectScanStopped(manager);

  // A fresh attempt starts a scan that actually finds the peripheral.
  await withDeadline(service.connect());

  expect(manager.scansStarted).toBe(2);
  expect(healthy.device.connectCount).toBe(1);

  service.dispose();
});

test("disconnect() while connected cancels the link without restarting the radio", async () => {
  const { service, manager, peripheral: healthy } = session();

  await withDeadline(service.connect());
  const stopsAfterConnect = manager.scansStopped;
  expectScanStopped(manager);

  await withDeadline(service.disconnect());

  // The scan was already stopped by the match; disconnecting must not add more.
  expect(manager.scansStopped).toBe(stopsAfterConnect);
  expect(healthy.device.cancelConnectionCount).toBe(1);

  service.dispose();
});

test("a peripheral advertising a different name is never connected to", async () => {
  const { service, manager, peripheral: stranger } = session({
    device: { name: "Otro", localName: "Otro" },
  });

  const connecting = service.connect();
  await nextTurn();

  expect(stranger.device.connectCount).toBe(0);
  expect(manager.scansStopped).toBe(0);

  await withDeadline(service.disconnect());
  await expectRejection(connecting, "Se canceló la búsqueda del dispositivo OhmSense");
  expect(stranger.device.connectCount).toBe(0);

  service.dispose();
});

// ---------------------------------------------------------------------------
// Problem 3: dispose() must actually disconnect
// ---------------------------------------------------------------------------

test("dispose() with an active connection cancels the link and destroys the manager", async () => {
  const { service, manager, peripheral: healthy } = session();

  await withDeadline(service.connect());
  service.dispose();

  expect(healthy.device.cancelConnectionCount).toBe(1);
  expectAllRemoved(healthy.data.monitors);
  expectAllRemoved(healthy.status.monitors);
  expectAllRemoved(healthy.device.disconnectSubscriptions);
  expectAllRemoved(manager.stateSubscriptions);
  expect(manager.destroyed).toBe(1);
});

test("dispose() with no connection does not fail", async () => {
  const { service, manager, peripheral: healthy } = session();

  service.dispose();

  expect(manager.destroyed).toBe(1);
  expect(manager.scansStopped).toBe(0);
  expect(healthy.device.cancelConnectionCount).toBe(0);
});

test("dispose() called three times neither throws nor repeats the teardown", async () => {
  const { service, manager, peripheral: healthy } = session();

  await withDeadline(service.connect());

  service.dispose();
  service.dispose();
  service.dispose();

  expect(healthy.device.cancelConnectionCount).toBe(1);
  expect(manager.destroyed).toBe(1);
});

test("dispose() while a scan is pending stops the scan and settles connect()", async () => {
  const { service, manager, peripheral: healthy } = session({
    scan: { advertise: false },
  });

  const connecting = service.connect();
  await nextTurn();

  service.dispose();

  expect(manager.scansStopped).toBe(1);
  expect(manager.destroyed).toBe(1);
  await expectRejection(connecting, "Se canceló la búsqueda del dispositivo OhmSense");
});

test("a disposed service refuses to connect again", async () => {
  const { service, manager, peripheral: healthy } = session();

  await withDeadline(service.connect());
  service.dispose();

  await expectRejection(service.connect(), "El servicio BLE fue liberado");
  expect(healthy.device.connectCount).toBe(1);
});

// ---------------------------------------------------------------------------
// Unchanged behaviour the cleanup must not have disturbed
// ---------------------------------------------------------------------------

test("connecting twice is refused while a session is up", async () => {
  const { service, manager, peripheral: healthy } = session();

  await withDeadline(service.connect());

  await expectRejection(service.connect(), "Ya está conectado a un dispositivo OhmSense");
  expect(healthy.device.connectCount).toBe(1);

  service.dispose();
});

test("an unsolicited disconnect after connect() reaches the event handler", async () => {
  const { service, manager, peripheral: healthy } = session();

  const events: string[] = [];
  service.setEventHandler((event) => events.push(event.type));

  await withDeadline(service.connect());
  healthy.device.emitDisconnected();

  expect(events).toEqual(["DISCONNECTED"]);

  service.dispose();
});

test("Bluetooth going off mid-session is reported as an error, not a clean drop", async () => {
  const { service, manager, peripheral: healthy } = session();

  const events: string[] = [];
  service.setEventHandler((event) => events.push(event.type));

  await withDeadline(service.connect());
  manager.emitState("PoweredOff");

  expect(events).toEqual(["ERROR"]);
  expectAllRemoved(healthy.device.disconnectSubscriptions);

  service.dispose();
});

test("Bluetooth already off is rejected before any scan starts", async () => {
  const { service, manager } = session({ scan: { state: "PoweredOff" } });

  await expectRejection(service.connect(), "Bluetooth está apagado. Actívalo e inténtalo de nuevo.");

  expect(manager.scansStarted).toBe(0);

  service.dispose();
});

test("the packet answering a measurement is not also fanned out to subscribers", async () => {
  const { service, manager, peripheral: healthy } = session();

  const received: DeviceData[] = [];
  service.subscribe((data) => received.push(data));

  await withDeadline(service.connect());
  const reading = await withDeadline(service.requestMeasurement());

  expect(received).toHaveLength(0);

  // A later unsolicited DATA notification does reach subscribers.
  healthy.data.emit(SECOND_READING_BASE64);
  await nextTurn();

  expect(received).toEqual([SECOND_READING]);
  expect(reading).toEqual(FIRST_READING);

  service.dispose();
});

test("a STATUS of ERROR rejects the pending measurement", async () => {
  // A peripheral that accepts MEASURE but reports the failure on STATUS.
  const { service, peripheral } = session({ peripheral: { autoAnswer: false } });

  await withDeadline(service.connect());

  const pending = service.requestMeasurement();
  await nextTurn();
  expect(peripheral.command.written).toEqual(["AQ=="]);
  // 0x03 = ERROR, as a one byte payload.
  peripheral.status.emit("Aw==");
  await expectRejection(pending, "El dispositivo no pudo completar la medición");

  service.dispose();
});

test("a malformed DATA packet is dropped without disturbing the session", async () => {
  const { service, manager, peripheral: healthy } = session();

  const received: DeviceData[] = [];
  service.subscribe((data) => received.push(data));

  await withDeadline(service.connect());

  healthy.data.emit(SECOND_READING_BASE64);
  healthy.data.emit("AAAA"); // valid base64, but not 9 bytes
  healthy.data.emit("AQ=="); // right length, wrong version byte
  await nextTurn();

  expect(received).toEqual([SECOND_READING]);

  // The session is still usable after the bad packets.
  const reading = await withDeadline(service.requestMeasurement());
  expect(reading).toEqual(FIRST_READING);

  service.dispose();
});
