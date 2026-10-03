import { MAX_BATTERY_PERCENT } from "../../constants/config";
import type { DeviceData } from "../../types/device";
import {
  DATA_PACKET_LENGTH,
  MICRO_OHMS_PER_OHM,
  PROTOCOL_VERSION,
  STATUS_CODES,
  STATUS_PACKET_LENGTH,
} from "./bleConstants";

/** Decoded meaning of the single STATUS byte. */
export type DeviceStatus = "READY" | "MEASURING" | "RESULT_READY" | "ERROR";

/**
 * Raised for every malformed payload. Callers log and drop these: a bad packet
 * from the peripheral must never crash the app or poison the state machine.
 */
export class BleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BleParseError";
  }
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const BASE64_VALUES = (() => {
  const table = new Int8Array(256).fill(-1);
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

function toHex(byte: number): string {
  return `0x${byte.toString(16).padStart(2, "0")}`;
}

/**
 * Self-contained base64 decoder. The library hands characteristic values over as
 * base64 strings, and Hermes does not reliably provide `atob`, so the decoding
 * is implemented here rather than delegated to a global.
 */
export function decodeBase64(base64: string): Uint8Array {
  if (typeof base64 !== "string") {
    throw new BleParseError("Valor base64 inválido: no es una cadena");
  }

  const compact = base64.replace(/\s+/g, "");
  if (compact.length === 0) {
    return new Uint8Array(0);
  }
  if (compact.length % 4 !== 0) {
    throw new BleParseError(`Valor base64 inválido: longitud ${compact.length} no múltiplo de 4`);
  }

  let padding = 0;
  if (compact.endsWith("==")) {
    padding = 2;
  } else if (compact.endsWith("=")) {
    padding = 1;
  }

  const body = compact.slice(0, compact.length - padding);
  const bytes = new Uint8Array((compact.length / 4) * 3 - padding);

  let buffer = 0;
  let bits = 0;
  let offset = 0;

  for (let index = 0; index < body.length; index += 1) {
    const value = BASE64_VALUES[body.charCodeAt(index)];
    if (value < 0) {
      throw new BleParseError(
        `Valor base64 inválido: carácter "${body[index]}" en la posición ${index}`,
      );
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset] = (buffer >> bits) & 0xff;
      offset += 1;
    }
  }

  return bytes;
}

/** Inverse of {@link decodeBase64}, used to build COMMAND payloads. */
export function encodeBase64(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const remaining = bytes.length - index;
    const byte0 = bytes[index];
    const byte1 = remaining > 1 ? bytes[index + 1] : 0;
    const byte2 = remaining > 2 ? bytes[index + 2] : 0;

    output += BASE64_ALPHABET[byte0 >> 2];
    output += BASE64_ALPHABET[((byte0 & 0x03) << 4) | (byte1 >> 4)];
    output += remaining > 1 ? BASE64_ALPHABET[((byte1 & 0x0f) << 2) | (byte2 >> 6)] : "=";
    output += remaining > 2 ? BASE64_ALPHABET[byte2 & 0x3f] : "=";
  }
  return output;
}

/**
 * Decodes a DATA notification payload.
 *
 * Layout, offsets from the protocol spec:
 *   0    1  version       must be 0x01
 *   1-4  4  resistance    uint32 little-endian, micro-ohms
 *   5    1  battery       percent
 *   6    1  charging      non-zero means charging
 *   7-8  2  chargeTime    uint16 little-endian, minutes, 0 means unknown
 *
 * Little-endian fields are assembled with DataView so that no shift can leak a
 * sign bit. `chargeTime` is normalised to `null` here, which is what the
 * existing `DeviceData` contract already expects.
 */
export function parseDataPacket(bytes: Uint8Array): DeviceData {
  if (bytes.length !== DATA_PACKET_LENGTH) {
    throw new BleParseError(
      `Paquete de datos inválido: ${bytes.length} bytes, se esperaban ${DATA_PACKET_LENGTH}`,
    );
  }

  const version = bytes[0];
  if (version !== PROTOCOL_VERSION) {
    throw new BleParseError(
      `Versión de protocolo no soportada: ${toHex(version)}, se esperaba ${toHex(PROTOCOL_VERSION)}`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const resistanceMicroOhms = view.getUint32(1, true);
  const rawBattery = view.getUint8(5);
  const charging = view.getUint8(6) !== 0;
  const chargeTimeMinutes = view.getUint16(7, true);

  return {
    resistance: resistanceMicroOhms / MICRO_OHMS_PER_OHM,
    // The wire format has no sentinel for "unknown", so the only defensible
    // clamp is the 0-100 range the BatteryCard can actually render.
    battery: Math.min(MAX_BATTERY_PERCENT, rawBattery),
    charging,
    chargeTime: chargeTimeMinutes === 0 ? null : chargeTimeMinutes,
  };
}

const STATUS_NAMES: Readonly<Record<number, DeviceStatus | undefined>> = {
  [STATUS_CODES.READY]: "READY",
  [STATUS_CODES.MEASURING]: "MEASURING",
  [STATUS_CODES.RESULT_READY]: "RESULT_READY",
  [STATUS_CODES.ERROR]: "ERROR",
};

/** Decodes a STATUS notification payload: exactly one byte. */
export function parseStatusPacket(bytes: Uint8Array): DeviceStatus {
  if (bytes.length !== STATUS_PACKET_LENGTH) {
    throw new BleParseError(
      `Paquete de estado inválido: ${bytes.length} bytes, se esperaba ${STATUS_PACKET_LENGTH}`,
    );
  }

  const code = bytes[0];
  const status = STATUS_NAMES[code];
  if (status === undefined) {
    throw new BleParseError(`Código de estado desconocido: ${toHex(code)}`);
  }
  return status;
}
