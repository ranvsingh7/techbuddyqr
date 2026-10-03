import { AsyncLocalStorage } from "node:async_hooks";

type AfterTask = () => Promise<void>;
type ScopeStore = { run<R>(store: unknown, fn: () => R): R };

// Next's server runtime publishes AsyncLocalStorage on globalThis before it
// loads its request-scope stores. Vitest imports the route directly, so the
// same global has to exist first or Next falls back to a throwing stub.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;

const stores = async (): Promise<{ work: ScopeStore; unit: ScopeStore }> => {
  const [{ workAsyncStorage }, { workUnitAsyncStorage }] = await Promise.all([
    import("next/dist/server/app-render/work-async-storage.external"),
    import("next/dist/server/app-render/work-unit-async-storage.external"),
  ]);

  return { work: workAsyncStorage as unknown as ScopeStore, unit: workUnitAsyncStorage as unknown as ScopeStore };
};

/**
 * Runs a route handler the way Next.js does, capturing the callbacks passed to
 * `after()` so a test can await them explicitly instead of racing the runtime.
 */
export async function withRequestScope<R>(run: () => Promise<R>): Promise<{ result: R; deferred: AfterTask[] }> {
  const { work, unit } = await stores();
  const deferred: AfterTask[] = [];

  const result = await work.run({ afterContext: { after: (task: AfterTask) => void deferred.push(task) } }, () =>
    unit.run({}, run),
  );

  return { result, deferred };
}

/** A request with a deterministic client IP and user agent. */
export function requestWithIp(ip: string, path = "/", init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set("x-forwarded-for", ip);
  headers.set("user-agent", "vitest");
  return new Request(`http://localhost:3000${path}`, { ...init, headers });
}
