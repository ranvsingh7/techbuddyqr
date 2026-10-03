import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";

/** Connects through the app's own helper, which setup.ts points at the test database. */
export async function connectTestDatabase(): Promise<void> {
  await dbConnect();
}

export async function disconnectTestDatabase(): Promise<void> {
  delete (globalThis as { __mongoose?: unknown }).__mongoose;
  await mongoose.disconnect();
}

/** Removes every document and rebuilds indexes so each test file starts clean. */
export async function resetTestDatabase(): Promise<void> {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));

  const models = ["QR", "Merchant", "Template", "ScanEvent"] as const;
  for (const name of models) {
    const model = mongoose.models[name];
    if (model) await model.syncIndexes();
  }
}

export { dbConnect };
