import { Readable } from "node:stream";
import mongoose, { type Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { ApiError } from "@/lib/api-error";

/**
 * Template artwork lives in GridFS, not on disk.
 *
 * One stored image per template, shared by every QR printed from it. Generated
 * designs are composited on demand and never stored, so the number of stored
 * images always equals the number of templates.
 */
export const TEMPLATE_IMAGE_BUCKET = "templateImages";

type ObjectId = Types.ObjectId;
type GridFSBucket = InstanceType<typeof mongoose.mongo.GridFSBucket>;

export type TemplateImageMeta = {
  id: ObjectId;
  contentType: string;
  length: number;
  filename: string;
};

const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/**
 * The bucket carries no `contentType` of its own in the driver any more, so the
 * type travels in `metadata` and the filename is the fallback.
 */
function contentTypeFor(file: { filename: string; metadata?: Record<string, unknown> }): string {
  const stored = file.metadata?.contentType;
  if (typeof stored === "string" && stored.startsWith("image/")) return stored;

  const extension = file.filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? "application/octet-stream";
}

/**
 * The single bucket for this instance.
 *
 * It is built on the shared Mongoose connection rather than a second driver
 * client, so GridFS never competes with the rest of the app for Atlas
 * connections. Memoising the promise instead of the bucket means concurrent
 * requests still produce one bucket, and a failed connection clears the cache
 * so the next request rebuilds it.
 *
 * The `Db` it was built from is remembered alongside it. A serverless instance
 * whose connection has been recycled gets a new `Db`, and a bucket pointing at
 * the old one would fail every read, so the cache is rebuilt in that case.
 */
let bucketPromise: Promise<GridFSBucket> | null = null;
let bucketDb: unknown = null;

export function templateImageBucket(): Promise<GridFSBucket> {
  if (!bucketPromise) bucketPromise = buildBucket();

  return bucketPromise.then((bucket) => {
    const db = mongoose.connection.db;
    // The connection was recycled underneath us; build again on the live one.
    if (db && db !== bucketDb) return buildBucket();
    return bucket;
  });
}

async function buildBucket(): Promise<GridFSBucket> {
  try {
    await dbConnect();

    const db = mongoose.connection.db;
    if (!db) throw new ApiError("INTERNAL_ERROR", 503, undefined, "Database connection is not ready");

    const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: TEMPLATE_IMAGE_BUCKET });
    bucketDb = db;
    return bucket;
  } catch (error) {
    bucketPromise = null;
    bucketDb = null;
    throw error;
  }
}

/** Test seam: forget the memoised bucket so the next call rebuilds it. */
export function resetTemplateImageBucket(): void {
  bucketPromise = null;
  bucketDb = null;
}

/** Narrows an untrusted id to an ObjectId, so a bad id never reaches GridFS. */
export function assertImageFileId(value: unknown): ObjectId {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === "string" && mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);

  throw new ApiError("VALIDATION_ERROR", 400, { image: "Invalid image reference" });
}

/** Stores the original artwork once and returns the id the template keeps. */
export async function uploadTemplateImage(data: Buffer, contentType: string, filename = "template"): Promise<ObjectId> {
  const bucket = await templateImageBucket();

  return new Promise<ObjectId>((resolve, reject) => {
    const stream = bucket.openUploadStream(filename, { metadata: { contentType } });
    stream.once("error", reject);
    stream.once("finish", () => resolve(stream.id));
    Readable.from(data).pipe(stream);
  });
}

/** The files entry, used for Content-Type and Content-Length before streaming. */
export async function getTemplateImageMeta(fileId: ObjectId): Promise<TemplateImageMeta | null> {
  const bucket = await templateImageBucket();
  const file = await bucket.find({ _id: fileId }).limit(1).next();
  if (!file) return null;

  return {
    id: file._id,
    contentType: contentTypeFor(file as { filename: string; metadata?: Record<string, unknown> }),
    length: file.length,
    filename: file.filename,
  };
}

/**
 * The artwork as a stream, so a large template is piped to the client instead
 * of being buffered into the function's memory.
 */
export async function openTemplateImageStream(fileId: ObjectId): Promise<Readable> {
  const bucket = await templateImageBucket();
  return bucket.openDownloadStream(fileId);
}

/** The artwork as bytes, for compositing a design. Never persisted. */
export async function readTemplateImageBuffer(fileId: ObjectId): Promise<Buffer> {
  const bucket = await templateImageBucket();
  const chunks: Buffer[] = [];

  for await (const chunk of bucket.openDownloadStream(fileId)) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }

  return Buffer.concat(chunks);
}

/** Removes a file and its chunks. Returns false when there was nothing to remove. */
export async function deleteTemplateImage(fileId: ObjectId): Promise<boolean> {
  const bucket = await templateImageBucket();

  // This driver version's `delete` resolves void, so existence is checked first
  // to keep the caller-visible result meaningful.
  if (!(await bucket.find({ _id: fileId }, { limit: 1 }).hasNext())) return false;

  await bucket.delete(fileId);
  return true;
}