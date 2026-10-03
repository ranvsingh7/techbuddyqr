import mongoose from "mongoose";
import { env } from "@/lib/env";

type MongooseCache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

const globalForMongoose = globalThis as unknown as { __mongoose?: MongooseCache };
const cache = (globalForMongoose.__mongoose ??= { conn: null, promise: null });

/** Connects once per process and reuses the connection across hot reloads. */
export async function dbConnect(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose.connect(env().mongodbUri, { bufferCommands: false });
  }

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }

  return cache.conn;
}
