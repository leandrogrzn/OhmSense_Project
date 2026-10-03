import { hasBleManager } from "./bleManager";

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

/**
 * The BLE library resolves `TurboModuleRegistry.getEnforcing('BlePlx')` at
 * module scope, reached from its entry point via BleManager -> BleModule. Mock
 * mode is only safe in Expo Go, where that native module does not exist, if
 * nothing evaluates the package until a manager is genuinely requested.
 *
 * This test is a real guard rather than a comment: bleManager.ts is importable
 * here only because its package import is type-only, which TypeScript erases.
 * If anyone promotes that to a value import, this file starts failing to load
 * under bun, and the same failure would hit Expo Go at startup.
 */
test("importing the manager accessor does not build a native manager", () => {
  expect(hasBleManager()).toBe(false);
});
