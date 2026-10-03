import mongoose from "mongoose";
import { env } from "@/lib/env";

type MongooseCache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

const globalForMongoose = globalThis as unknown as { __mongoose?: MongooseCache };
const cache = (globalForMongoose.__mongoose ??= { conn: null, promise: null });

/** Connects once per process and reuses the connection across hot reloads. */
export async function dbConnect(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose.connect(env().mongodbUri, {
      /**
       * Operations are queued while the socket is still coming up instead of
       * being rejected. React renders a layout and its page concurrently, so on a
       * cold instance the page's first query used to run while the layout's
       * `dbConnect()` was still in flight and threw
       * "Cannot call ... before initial connection is complete". Reloading the
       * page then worked, because by then the connection existed.
       */
      bufferCommands: true,
      /** Fail in seconds, not the 30s default, which is longer than a function's budget. */
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      /**
       * A small pool on purpose. Every warm instance holds its own pool, so the
       * default of 100 multiplied by the number of Fluid Compute instances can
       * exhaust an Atlas connection limit and turn cold starts into failures.
       */
      maxPoolSize: 10,
      minPoolSize: 0,
    });
  }

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }

  return cache.conn;
}
