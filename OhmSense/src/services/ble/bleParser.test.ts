import { formatResistance } from "../../utils/formatResistance";
import {
  COMMAND_CODES,
  DATA_PACKET_LENGTH,
  MICRO_OHMS_PER_OHM,
  PROTOCOL_VERSION,
  STATUS_CODES,
} from "./bleConstants";
import {
  BleParseError,
  decodeBase64,
  encodeBase64,
  parseDataPacket,
  parseStatusPacket,
} from "./bleParser";

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
  toThrow(expected?: unknown): void;
};

interface DataPacketSpec {
  version?: number;
  resistanceMicroOhms?: number;
  battery?: number;
  charging?: number;
  chargeTimeMinutes?: number;
}

function buildDataPacket({
  version = PROTOCOL_VERSION,
  resistanceMicroOhms = 0,
  battery = 0,
  charging = 0,
  chargeTimeMinutes = 0,
}: DataPacketSpec = {}): Uint8Array {
  const bytes = new Uint8Array(DATA_PACKET_LENGTH);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, version);
  view.setUint32(1, resistanceMicroOhms, true);
  view.setUint8(5, battery);
  view.setUint8(6, charging);
  view.setUint16(7, chargeTimeMinutes, true);
  return bytes;
}

// The protocol's worked example. NOTE: the planning document quoted this payload
// as the 10-character string "BRXQAA0AAA", which is not a valid base64 length.
// The byte array it describes encodes to the 12-character string below, so the
// bytes, and therefore every expected value, are unchanged.
const PROTOCOL_EXAMPLE_BASE64 = "AVEdAABNAAAA";
const PROTOCOL_EXAMPLE_BYTES = [0x01, 0x51, 0x1d, 0x00, 0x00, 0x4d, 0x00, 0x00, 0x00];

test("decodeBase64 decodes the protocol example", () => {
  expect(Array.from(decodeBase64(PROTOCOL_EXAMPLE_BASE64))).toEqual(PROTOCOL_EXAMPLE_BYTES);
});

test("decodeBase64 decodes every padding length", () => {
  expect(Array.from(decodeBase64("AA=="))).toEqual([0x00]);
  expect(Array.from(decodeBase64("AAA="))).toEqual([0x00, 0x00]);
  expect(Array.from(decodeBase64("AAAA"))).toEqual([0x00, 0x00, 0x00]);
  expect(Array.from(decodeBase64(""))).toEqual([]);
});

test("decodeBase64 rejects malformed input", () => {
  expect(() => decodeBase64("AAA")).toThrow(BleParseError);
  expect(() => decodeBase64("BR*Q")).toThrow(BleParseError);
});

test("encodeBase64 round-trips decodeBase64", () => {
  for (let length = 0; length <= DATA_PACKET_LENGTH; length += 1) {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = (index * 37 + 11) & 0xff;
    }
    expect(Array.from(decodeBase64(encodeBase64(bytes)))).toEqual(Array.from(bytes));
  }
});

test("encodeBase64 produces the MEASURE command payload", () => {
  expect(encodeBase64(Uint8Array.of(COMMAND_CODES.MEASURE))).toBe("AQ==");
});

test("parseDataPacket reproduces the protocol example", () => {
  const data = parseDataPacket(decodeBase64(PROTOCOL_EXAMPLE_BASE64));
  expect(data.resistance).toBe(0.007505);
  expect(data.battery).toBe(77);
  expect(data.charging).toBe(false);
  expect(data.chargeTime).toBe(null);
});

test("parseDataPacket maps chargeTime 0 to null and real values to minutes", () => {
  expect(parseDataPacket(buildDataPacket({ chargeTimeMinutes: 0 })).chargeTime).toBe(null);
  expect(parseDataPacket(buildDataPacket({ chargeTimeMinutes: 84 })).chargeTime).toBe(84);
  expect(parseDataPacket(buildDataPacket({ chargeTimeMinutes: 65535 })).chargeTime).toBe(65535);
});

test("parseDataPacket treats any non-zero charging byte as true", () => {
  expect(parseDataPacket(buildDataPacket({ charging: 0 })).charging).toBe(false);
  expect(parseDataPacket(buildDataPacket({ charging: 1 })).charging).toBe(true);
  expect(parseDataPacket(buildDataPacket({ charging: 2 })).charging).toBe(true);
  expect(parseDataPacket(buildDataPacket({ charging: 255 })).charging).toBe(true);
});

test("parseDataPacket converts a 1 ohm reading and the formatter renders it", () => {
  const data = parseDataPacket(buildDataPacket({ resistanceMicroOhms: MICRO_OHMS_PER_OHM }));
  expect(data.resistance).toBe(1);
  expect(formatResistance(data.resistance)).toEqual({ value: "1.000", unit: "Ω" });
});

test("parseDataPacket keeps sub-ohm readings in ohms for the existing formatter", () => {
  const data = parseDataPacket(buildDataPacket({ resistanceMicroOhms: 7505 }));
  expect(data.resistance).toBe(0.007505);
  expect(formatResistance(data.resistance)).toEqual({ value: "7.505", unit: "mΩ" });
});

test("parseDataPacket assembles little-endian resistance above 2^31 micro-ohms", () => {
  // A signed `<< 24` assembly would report these as negative.
  expect(parseDataPacket(buildDataPacket({ resistanceMicroOhms: 0x80000000 })).resistance).toBe(
    2147.483648,
  );
  expect(parseDataPacket(buildDataPacket({ resistanceMicroOhms: 0xffffffff })).resistance).toBe(
    4294.967295,
  );
  expect(parseDataPacket(buildDataPacket({ resistanceMicroOhms: 1 })).resistance).toBe(0.000001);
});

test("parseDataPacket reads little-endian fields from a byte view with an offset", () => {
  const backing = new Uint8Array(DATA_PACKET_LENGTH + 4);
  backing.set(PROTOCOL_EXAMPLE_BYTES, 4);

  const data = parseDataPacket(backing.subarray(4));
  expect(data.resistance).toBe(0.007505);
  expect(data.battery).toBe(77);
});

test("parseDataPacket rejects the wrong length", () => {
  expect(() => parseDataPacket(new Uint8Array(0))).toThrow(BleParseError);
  expect(() => parseDataPacket(new Uint8Array(DATA_PACKET_LENGTH - 1))).toThrow(BleParseError);
  expect(() => parseDataPacket(new Uint8Array(DATA_PACKET_LENGTH + 1))).toThrow(BleParseError);
});

test("parseDataPacket rejects an unsupported version byte", () => {
  expect(() => parseDataPacket(buildDataPacket({ version: 0x00 }))).toThrow(BleParseError);
  expect(() => parseDataPacket(buildDataPacket({ version: 0x02 }))).toThrow(BleParseError);
  expect(parseDataPacket(buildDataPacket({ version: PROTOCOL_VERSION })).battery).toBe(0);
});

test("parseDataPacket clamps a battery byte the UI could not otherwise render", () => {
  expect(parseDataPacket(buildDataPacket({ battery: 100 })).battery).toBe(100);
  expect(parseDataPacket(buildDataPacket({ battery: 255 })).battery).toBe(100);
});

test("parseStatusPacket decodes every protocol status", () => {
  expect(parseStatusPacket(Uint8Array.of(STATUS_CODES.READY))).toBe("READY");
  expect(parseStatusPacket(Uint8Array.of(STATUS_CODES.MEASURING))).toBe("MEASURING");
  expect(parseStatusPacket(Uint8Array.of(STATUS_CODES.RESULT_READY))).toBe("RESULT_READY");
  expect(parseStatusPacket(Uint8Array.of(STATUS_CODES.ERROR))).toBe("ERROR");
});

test("parseStatusPacket rejects unknown codes and wrong lengths", () => {
  expect(() => parseStatusPacket(Uint8Array.of(0x04))).toThrow(BleParseError);
  expect(() => parseStatusPacket(Uint8Array.of(0xff))).toThrow(BleParseError);
  expect(() => parseStatusPacket(new Uint8Array(0))).toThrow(BleParseError);
  expect(() => parseStatusPacket(Uint8Array.of(STATUS_CODES.READY, 0x00))).toThrow(BleParseError);
});
