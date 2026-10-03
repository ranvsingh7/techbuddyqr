import { existsSync, readFileSync } from "node:fs";

/** Mirrors .env.local so tests run with the same configuration as `npm run dev`. */
const envFile = ".env.local";

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]!]) process.env[match[1]!] = match[2]!;
  }
}

process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.STORAGE_DIR ??= "./storage";
process.env.TEST_MONGODB_URI ??= "mongodb://127.0.0.1:27018/qrbuilder_test";

// Never touch a real database from a test run.
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;

// --- DOM shims for component tests ---------------------------------------
// happy-dom does not implement pointer capture or ResizeObserver.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (typeof Element !== "undefined") {
  const prototype = Element.prototype as unknown as Record<string, unknown>;
  const noop = () => {};

  prototype.setPointerCapture ??= noop;
  prototype.releasePointerCapture ??= noop;
  prototype.hasPointerCapture ??= () => false;
}
