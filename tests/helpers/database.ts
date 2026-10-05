import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { templateImageBucket } from "@/lib/gridfs";

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

/** Files currently stored in the template artwork bucket. */
export async function gridfsFiles(): Promise<Array<{ _id: mongoose.Types.ObjectId; length: number; metadata?: Record<string, unknown> }>> {
  const bucket = await templateImageBucket();
  const found: Array<{ _id: mongoose.Types.ObjectId; length: number; metadata?: Record<string, unknown> }> = [];

  for await (const file of bucket.find({})) {
    found.push({ _id: file._id, length: file.length, metadata: file.metadata as Record<string, unknown> | undefined });
  }

  return found;
}

/** Every chunk document backing the bucket, so orphaned data is detectable. */
export async function gridfsChunkCount(): Promise<number> {
  return mongoose.connection.db!.collection("templateImages.chunks").countDocuments();
}

export { dbConnect };
