/**
 * Wire-level constants of the OhmSense BLE protocol.
 *
 * This module is pure data: it imports nothing from React Native and nothing
 * from the BLE library, so it can be loaded from a plain bun test as well as
 * from the app. It is the single place where the protocol is declared; the
 * parser, the permissions helper and the service all read from here.
 */

/** Version byte that prefixes every DATA packet. */
export const PROTOCOL_VERSION = 0x01;

/**
 * OhmSense v1.0 UUIDs, exactly as published in the official protocol.
 *
 * These are vendor-specific 128-bit UUIDs under the `7b4f100x` prefix, so no
 * Bluetooth SIG registration is involved and the peripheral is free to expose
 * them without adopting a standard service. They are written out in full, in
 * lowercase, because every comparison in the service runs them through
 * {@link normaliseUuid} first.
 *
 * The four values differ only in the final hex digit, so a typo in one of them
 * produces a peripheral that connects but fails verification. That is why
 * bleConstants.test.ts pins each of them against a literal copy of the spec.
 */
export const OHMSENSE_SERVICE_UUID = "7b4f1000-6a5e-4d91-9c2a-8f4e5b3d2101";
export const OHMSENSE_DATA_UUID = "7b4f1001-6a5e-4d91-9c2a-8f4e5b3d2101";
export const OHMSENSE_COMMAND_UUID = "7b4f1002-6a5e-4d91-9c2a-8f4e5b3d2101";
export const OHMSENSE_STATUS_UUID = "7b4f1003-6a5e-4d91-9c2a-8f4e5b3d2101";

/**
 * Name the peripheral advertises. Android usually only populates `localName`
 * from the advertising packet, so both fields are compared against this value.
 */
export const ADVERTISED_DEVICE_NAME = "OhmSense";

/** STATUS characteristic payload: a single byte from this table. */
export const STATUS_CODES = {
  READY: 0x00,
  MEASURING: 0x01,
  RESULT_READY: 0x02,
  ERROR: 0x03,
} as const;

/** COMMAND characteristic payload: a single byte from this table. */
export const COMMAND_CODES = {
  MEASURE: 0x01,
} as const;

/** Resistance is transmitted in micro-ohms, DeviceData holds ohms. */
export const MICRO_OHMS_PER_OHM = 1_000_000;

/**
 * Expands a 16- or 32-bit UUID to its full 128-bit lowercase form.
 *
 * This mirrors the library's `fullUUID` helper, which lives behind the package's
 * entry point and therefore cannot be imported without evaluating the native
 * module. A case or 16-bit expansion mismatch is the classic source of a false
 * "service not found", so both sides of every comparison go through here.
 */
export function normaliseUuid(uuid: string): string {
  if (uuid.length === 4) {
    return `0000${uuid.toLowerCase()}-0000-1000-8000-00805f9b34fb`;
  }
  if (uuid.length === 8) {
    return `${uuid.toLowerCase()}-0000-1000-8000-00805f9b34fb`;
  }
  return uuid.toLowerCase();
}

/** Fixed packet sizes, validated by the parser. */
export const DATA_PACKET_LENGTH = 9;
export const STATUS_PACKET_LENGTH = 1;

/** Scan is stopped and the connection rejected after this long. */
export const SCAN_TIMEOUT_MS = 10_000;

/** A MEASURE command that is not answered by a DATA packet fails after this. */
export const MEASUREMENT_TIMEOUT_MS = 5_000;

/** connect() + service discovery must complete within this budget. */
export const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Secondary, non-gating scan signal: an advertisement already carrying the
 * OhmSense service UUID is a stronger match than the name alone. Recorded for
 * diagnostics, not required to accept a device.
 */
export const STRONG_MATCH_USES_SERVICE_UUID = true;
