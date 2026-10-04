import mongoose from "mongoose";
import { env } from "@/lib/env";

type MongooseCache = {
  /** The single in-flight or settled `mongoose.connect()` for this instance. */
  promise: Promise<typeof mongoose> | null;
  /** True once `promise` resolved. A settled promise is only reusable while its socket is alive. */
  settled: boolean;
};

const globalForMongoose = globalThis as unknown as { __mongoose?: MongooseCache };
const cache = (globalForMongoose.__mongoose ??= { promise: null, settled: false });

/**
 * Connection tracing for local debugging. Development and test only, and it
 * never prints the URI or any credential in it.
 */
function trace(event: string, detail: Record<string, unknown> = {}): void {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[db] ${event}`, { readyState: mongoose.connection.readyState, ...detail });
}

/**
 * Connects once per instance and hands every caller the same connection.
 *
 * Server Components are not a safe place to assume somebody else already
 * connected: React renders a layout and its page concurrently, and Fluid
 * Compute runs several requests in one instance. So every query path calls this
 * and awaits it, and the invariant it upholds is that at most one
 * `mongoose.connect()` exists per instance at a time.
 */
export async function dbConnect(): Promise<typeof mongoose> {
  // The socket is up. Returning `mongoose` rather than a cached object means a
  // connection that dropped while idle is never handed back as if it were live.
  if (mongoose.connection.readyState === 1) return mongoose;

  /**
   * A promise that already resolved is only reusable while its socket is
   * alive. `readyState !== 1` here, so Atlas or an intermediary closed the
   * idle connection: drop the stale promise and connect again instead of
   * awaiting it and handing out a connection with no socket behind it.
   */
  if (cache.settled) cache.promise = null;

  if (!cache.promise) {
    trace("connect: starting attempt");
    cache.settled = false;
    const attempt = mongoose.connect(env().mongodbUri, {
      /**
       * Defence in depth, not the fix: the page components await `dbConnect()`
       * themselves, so the layout can no longer be the only thing connecting
       * while a page races ahead of it. `bufferTimeoutMS` is deliberately left
       * at its 10s default, because the fix is to connect sooner rather than to
       * wait longer before giving up.
       */
      bufferCommands: true,
      /** Fail in seconds, not the 30s default, which is longer than a function's budget. */
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      /**
       * A small pool on purpose. Every warm instance holds its own pool, so a
       * large default multiplied by the number of Fluid Compute instances can
       * exhaust the Atlas connection limit and turn cold starts into failures.
       */
      maxPoolSize: 10,
      minPoolSize: 0,
    });
    cache.promise = attempt;

    attempt.then(
      () => {
        cache.settled = true;
        trace("connect: established");
      },
      (error: unknown) => {
        cache.settled = true;
        trace("connect: failed", { message: error instanceof Error ? error.message : String(error) });
      },
    );
    // The cached promise can outlive this call, so give the rejection a handler
    // now instead of letting it surface as an unhandled rejection.
    attempt.catch(() => {});
  } else {
    trace(cache.settled ? "connect: reusing settled attempt" : "connect: reusing in-flight attempt");
  }

  try {
    return await cache.promise;
  } catch (error) {
    // Only a genuinely failed attempt clears the cache, so the next caller
    // starts a fresh one rather than awaiting a rejected promise forever.
    cache.promise = null;
    cache.settled = true;
    throw error;
  }
}