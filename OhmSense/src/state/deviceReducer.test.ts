import type { DeviceData, DeviceState } from "../types/device";
import {
  canRequestMeasurement,
  deviceReducer,
  initialDeviceState,
  isConnectionInProgress,
  isConnected,
} from "./deviceReducer";

/**
 * `bun test` provides `test` and `expect` as globals. They are declared here
 * instead of imported from "bun:test" so the project needs no bun type package
 * and no tsconfig change. These declarations are module scoped, so they leak
 * into nothing else. Run the suite with `bun test`.
 */
declare function test(name: string, fn: () => void | Promise<void>): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
};

const READING: DeviceData = {
  resistance: 0.007505,
  battery: 77,
  charging: false,
  chargeTime: null,
};

/** Applies a sequence of actions to the initial state, as a real session would. */
function reduce(actions: Parameters<typeof deviceReducer>[1][]): DeviceState {
  return actions.reduce(deviceReducer, initialDeviceState);
}

test("the initial state is disconnected with no data and no error", () => {
  expect(initialDeviceState).toEqual({
    connectionState: "DISCONNECTED",
    data: null,
    error: null,
  });
});

test("CONNECT_REQUESTED starts the scan and clears a previous error", () => {
  const failed: DeviceState = { connectionState: "ERROR", data: null, error: "No se encontró el dispositivo OhmSense" };

  expect(deviceReducer(failed, { type: "CONNECT_REQUESTED" })).toEqual({
    connectionState: "SCANNING",
    data: null,
    error: null,
  });
});

test("CONNECT_REQUESTED is ignored while a session is already in progress", () => {
  for (const connectionState of ["SCANNING", "CONNECTING", "CONNECTED", "MEASURING"] as const) {
    const state: DeviceState = { connectionState, data: null, error: null };
    expect(deviceReducer(state, { type: "CONNECT_REQUESTED" })).toBe(state);
  }
});

test("SERVICE_CONNECTING is only honoured while scanning", () => {
  expect(reduce([{ type: "CONNECT_REQUESTED" }, { type: "SERVICE_CONNECTING" }]).connectionState).toBe(
    "CONNECTING",
  );

  const disconnected: DeviceState = { ...initialDeviceState };
  expect(deviceReducer(disconnected, { type: "SERVICE_CONNECTING" })).toBe(disconnected);
});

test("CONNECTED clears the error, which is what a real connection reports", () => {
  const state = reduce([
    { type: "CONNECT_REQUESTED" },
    { type: "SERVICE_CONNECTING" },
    { type: "CONNECTED" },
  ]);

  expect(state.connectionState).toBe("CONNECTED");
  expect(state.error).toBe(null);
});

test("FAILED moves to ERROR, keeps the message and preserves the last reading", () => {
  const connected = reduce([
    { type: "CONNECT_REQUESTED" },
    { type: "SERVICE_CONNECTING" },
    { type: "CONNECTED" },
    { type: "MEASUREMENT_RECEIVED", data: READING },
  ]);

  const state = deviceReducer(connected, { type: "FAILED", message: "El dispositivo se desconectó" });

  expect(state.connectionState).toBe("ERROR");
  expect(state.error).toBe("El dispositivo se desconectó");
  expect(state.data).toEqual(READING);
});

test("DISCONNECTED returns to the initial state but keeps the last reading", () => {
  const measured = reduce([
    { type: "CONNECT_REQUESTED" },
    { type: "SERVICE_CONNECTING" },
    { type: "CONNECTED" },
    { type: "MEASUREMENT_RECEIVED", data: READING },
  ]);

  expect(deviceReducer(measured, { type: "DISCONNECTED" })).toEqual({
    connectionState: "DISCONNECTED",
    data: READING,
    error: null,
  });
});

test("MEASUREMENT_RECEIVED stores the reading and clears the error", () => {
  const failed = reduce([{ type: "FAILED", message: "La conexión con el dispositivo OhmSense tardó demasiado" }]);

  const state = deviceReducer(failed, { type: "MEASUREMENT_RECEIVED", data: READING });

  expect(state).toEqual({ connectionState: "MEASUREMENT_RECEIVED", data: READING, error: null });
});

test("DATA_UPDATED refreshes an existing reading", () => {
  const measured = reduce([{ type: "MEASUREMENT_RECEIVED", data: READING }]);
  const ticked: DeviceData = { ...READING, battery: 76 };

  expect(deviceReducer(measured, { type: "DATA_UPDATED", data: ticked }).data).toEqual(ticked);
});

test("DATA_UPDATED is ignored before the first reading exists", () => {
  expect(deviceReducer(initialDeviceState, { type: "DATA_UPDATED", data: READING })).toBe(
    initialDeviceState,
  );
});

test("MEASURE_REQUESTED is only honoured from a measurable state", () => {
  for (const connectionState of ["DISCONNECTED", "SCANNING", "CONNECTING", "MEASURING", "ERROR"] as const) {
    const state: DeviceState = { connectionState, data: null, error: null };
    expect(deviceReducer(state, { type: "MEASURE_REQUESTED" })).toBe(state);
  }

  const connected: DeviceState = { connectionState: "CONNECTED", data: READING, error: null };
  expect(deviceReducer(connected, { type: "MEASURE_REQUESTED" }).connectionState).toBe("MEASURING");
});

test("the full connect and measure sequence ends in a usable reading", () => {
  const state = reduce([
    { type: "CONNECT_REQUESTED" },
    { type: "SERVICE_CONNECTING" },
    { type: "CONNECTED" },
    { type: "MEASURE_REQUESTED" },
    { type: "MEASUREMENT_RECEIVED", data: READING },
  ]);

  expect(state).toEqual({ connectionState: "MEASUREMENT_RECEIVED", data: READING, error: null });
  expect(canRequestMeasurement(state)).toBe(true);
});

test("a failure during a measurement lands on ERROR and can be retried", () => {
  const failed = reduce([
    { type: "CONNECT_REQUESTED" },
    { type: "SERVICE_CONNECTING" },
    { type: "CONNECTED" },
    { type: "MEASURE_REQUESTED" },
    { type: "FAILED", message: "El dispositivo no respondió la medición a tiempo" },
  ]);

  expect(failed.connectionState).toBe("ERROR");
  expect(canRequestMeasurement(failed)).toBe(false);
  expect(deviceReducer(failed, { type: "CONNECT_REQUESTED" })).toEqual({
    connectionState: "SCANNING",
    data: null,
    error: null,
  });
});

test("an unknown action returns the same state object", () => {
  const state: DeviceState = { connectionState: "CONNECTED", data: READING, error: null };
  const action = { type: "NOT_A_REAL_ACTION" } as unknown as Parameters<typeof deviceReducer>[1];

  expect(deviceReducer(state, action)).toBe(state);
});

test("the selectors report progress, connectivity and measurability per state", () => {
  const inProgress = ["SCANNING", "CONNECTING"] as const;
  const connected = ["CONNECTED", "MEASURING", "MEASUREMENT_RECEIVED"] as const;

  for (const connectionState of inProgress) {
    expect(isConnectionInProgress(connectionState)).toBe(true);
    expect(isConnected(connectionState)).toBe(false);
  }
  for (const connectionState of connected) {
    expect(isConnected(connectionState)).toBe(true);
  }
  for (const connectionState of ["DISCONNECTED", "ERROR"] as const) {
    expect(isConnected(connectionState)).toBe(false);
    expect(isConnectionInProgress(connectionState)).toBe(false);
    expect(canRequestMeasurement({ connectionState, data: null, error: null })).toBe(false);
  }
  expect(canRequestMeasurement({ connectionState: "MEASURING", data: null, error: null })).toBe(false);
});
