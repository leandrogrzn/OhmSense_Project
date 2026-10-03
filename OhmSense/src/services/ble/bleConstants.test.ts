import {
  OHMSENSE_COMMAND_UUID,
  OHMSENSE_DATA_UUID,
  OHMSENSE_SERVICE_UUID,
  OHMSENSE_STATUS_UUID,
  normaliseUuid,
} from "./bleConstants";

/**
 * `bun test` provides `test` and `expect` as globals. They are declared here
 * instead of imported from "bun:test" so the project needs no bun type package
 * and no tsconfig change, matching the other suites in this folder.
 */
declare function test(name: string, fn: () => void | Promise<void>): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
};

/**
 * Literal copies of the OhmSense v1.0 UUIDs, taken from the published protocol
 * and deliberately NOT imported from bleConstants.
 *
 * The whole point of this suite is that the two sides are written out
 * independently: comparing an export against itself proves nothing, so a
 * regression to the unrelated adopted 0xFFEx family fails here instead of
 * silently breaking discovery against real hardware.
 */
const OFFICIAL_SERVICE_UUID = "7b4f1000-6a5e-4d91-9c2a-8f4e5b3d2101";
const OFFICIAL_DATA_UUID = "7b4f1001-6a5e-4d91-9c2a-8f4e5b3d2101";
const OFFICIAL_COMMAND_UUID = "7b4f1002-6a5e-4d91-9c2a-8f4e5b3d2101";
const OFFICIAL_STATUS_UUID = "7b4f1003-6a5e-4d91-9c2a-8f4e5b3d2101";

test("the service UUID is the one published in OhmSense v1.0", () => {
  expect(OHMSENSE_SERVICE_UUID).toBe(OFFICIAL_SERVICE_UUID);
});

test("the DATA characteristic UUID is the one published in OhmSense v1.0", () => {
  expect(OHMSENSE_DATA_UUID).toBe(OFFICIAL_DATA_UUID);
});

test("the COMMAND characteristic UUID is the one published in OhmSense v1.0", () => {
  expect(OHMSENSE_COMMAND_UUID).toBe(OFFICIAL_COMMAND_UUID);
});

test("the STATUS characteristic UUID is the one published in OhmSense v1.0", () => {
  expect(OHMSENSE_STATUS_UUID).toBe(OFFICIAL_STATUS_UUID);
});

test("every UUID carries the vendor prefix from the spec, not an adopted one", () => {
  // The published UUIDs all sit in the vendor specific 0x7B4F1xxx block. An
  // adopted base UUID (0x0000xxxx) would mean the app and the firmware drifted
  // onto different assignments, which is the failure this pins down.
  const uuids = [
    OHMSENSE_SERVICE_UUID,
    OHMSENSE_DATA_UUID,
    OHMSENSE_COMMAND_UUID,
    OHMSENSE_STATUS_UUID,
  ];

  for (const uuid of uuids) {
    expect(uuid.startsWith("7b4f10")).toBe(true);
  }
});

test("the four UUIDs are distinct, so each characteristic is matched separately", () => {
  const uuids = [
    OHMSENSE_SERVICE_UUID,
    OHMSENSE_DATA_UUID,
    OHMSENSE_COMMAND_UUID,
    OHMSENSE_STATUS_UUID,
  ];

  expect(new Set(uuids).size).toBe(4);
});

test("the official UUIDs survive normaliseUuid byte for byte", () => {
  // Every service and characteristic lookup runs both sides of the comparison
  // through normaliseUuid, so a full 128-bit UUID has to come back untouched.
  expect(normaliseUuid(OFFICIAL_SERVICE_UUID)).toBe(OFFICIAL_SERVICE_UUID);
  expect(normaliseUuid(OFFICIAL_DATA_UUID)).toBe(OFFICIAL_DATA_UUID);
  expect(normaliseUuid(OFFICIAL_COMMAND_UUID)).toBe(OFFICIAL_COMMAND_UUID);
  expect(normaliseUuid(OFFICIAL_STATUS_UUID)).toBe(OFFICIAL_STATUS_UUID);
});

test("a peripheral advertising the UUID in upper case is still recognised", () => {
  // The library is free to hand back a UUID in any case, so both sides are
  // normalised. The uppercase form stands in for that.
  expect(normaliseUuid(OFFICIAL_DATA_UUID.toUpperCase())).toBe(OFFICIAL_DATA_UUID);
  expect(normaliseUuid(OFFICIAL_DATA_UUID.toUpperCase())).toBe(
    normaliseUuid(OHMSENSE_DATA_UUID),
  );
});

test("normaliseUuid still expands short UUIDs and lowercases long ones", () => {
  // 0x180F is the Bluetooth SIG Generic Access Profile service: a short adopted
  // UUID, standing in for any of them.
  expect(normaliseUuid("180F")).toBe("0000180f-0000-1000-8000-00805f9b34fb");
  expect(normaliseUuid("0000180F")).toBe("0000180f-0000-1000-8000-00805f9b34fb");
  expect(normaliseUuid("7B4F1000-6A5E-4D91-9C2A-8F4E5B3D2101")).toBe(OFFICIAL_SERVICE_UUID);
});
