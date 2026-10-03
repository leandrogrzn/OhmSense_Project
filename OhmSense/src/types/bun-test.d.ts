/**
 * Minimal ambient declaration for the parts of `bun:test` this project uses.
 *
 * The other suites in this folder declare `test` and `expect` as globals so they
 * need no dependency on Bun's type definitions. That trick cannot be combined
 * with `mock.module`: a file that imports anything from `bun:test` no longer
 * receives the implicit globals, so it has to import its helpers too.
 *
 * `mock.module` is needed to stub `react-native`, which throws while parsing its
 * Flow sources outside a React Native runtime (BleDeviceService imports it both
 * directly and through blePermissions).
 *
 * Only the surface actually used is declared, and only under `bun test`.
 */
declare module "bun:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function expect(actual: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toHaveLength(expected: number): void;
    toBeGreaterThan(expected: number): void;
  };
  export const mock: {
    module(moduleName: string, factory: () => unknown): void;
  };
}