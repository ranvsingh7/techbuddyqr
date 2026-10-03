/**
 * Minimal typings for the two Next.js request-scope stores used to drive route
 * handlers inside Vitest, so `after()` behaves as it does during a real request.
 */
declare module "next/dist/server/app-render/work-async-storage.external" {
  export const workAsyncStorage: {
    run<R>(store: unknown, fn: () => R): R;
  };
}

declare module "next/dist/server/app-render/work-unit-async-storage.external" {
  export const workUnitAsyncStorage: {
    run<R>(store: unknown, fn: () => R): R;
  };
}
