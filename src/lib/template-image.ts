import { Readable } from "node:stream";
import type sharp from "sharp";
import type { Sharp } from "sharp";
import type { Types } from "mongoose";
import { ApiError } from "@/lib/api-error";
import { MAX_IMAGE_SIDE, MAX_UPLOAD_BYTES } from "@/lib/limits";
import { storage } from "@/lib/storage";
import {
  assertImageFileId,
  deleteTemplateImage,
  getTemplateImageMeta,
  openTemplateImageStream,
  readTemplateImageBuffer,
  uploadTemplateImage,
} from "@/lib/gridfs";

/**
 * Where a template's single original image comes from, and how a new one is
 * validated. This stays separate from the GridFS wrapper so that wrapper is a
 * thin piece of driver plumbing, and so the legacy filesystem remains readable
 * until every existing template has been migrated.
 */

/** The fields of a template document that decide which store holds its artwork. */
type TemplateImageRef = {
  imageFileId?: Types.ObjectId | null;
  imageKey?: string | null;
};

const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);
const CONTENT_TYPES: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
const EXTENSIONS: Record<string, string> = { png: ".png", jpeg: ".jpg", webp: ".webp" };

/**
 * Sharp is imported lazily: loading libvips costs real time on a cold function
 * and this module is reachable from pages that never touch a pixel.
 */
async function loadSharp(): Promise<typeof sharp> {
  const mod = (await import("sharp")) as { default?: typeof sharp };
  return mod.default ?? (mod as unknown as typeof sharp);
}

export type PreparedImage = {
  /** Re-encoded, orientation-corrected bytes. This is what gets stored once. */
  buffer: Buffer;
  contentType: string;
  filename: string;
  width: number;
  height: number;
};

/**
 * Validates an upload by decoding it, then re-encodes it into the same format
 * the application has always stored. Only real image data reaches a store, and a
 * template saved today renders exactly the way it did before.
 */
export async function prepareTemplateImage(file: File): Promise<PreparedImage> {
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError("VALIDATION_ERROR", 400, { image: "Image must be under 8 MB" });
  }

  const declaredType = file.type.toLowerCase();
  if (!declaredType.startsWith("image/")) {
    throw new ApiError("VALIDATION_ERROR", 400, { image: "Only PNG, JPG or WEBP images are allowed" });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sharp = await loadSharp();
  const metadata = await sharp(buffer, { limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE }).metadata().catch(() => null);

  if (!metadata?.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new ApiError("VALIDATION_ERROR", 400, { image: "Only PNG, JPG or WEBP images are allowed" });
  }
  if (metadata.width > MAX_IMAGE_SIDE || metadata.height > MAX_IMAGE_SIDE) {
    throw new ApiError("VALIDATION_ERROR", 400, { image: `Image must be at most ${MAX_IMAGE_SIDE}px on each side` });
  }

  const pipeline: Sharp = sharp(buffer, { limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE }).rotate();
  const encoded =
    metadata.format === "png"
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : metadata.format === "webp"
        ? await pipeline.webp({ quality: 95 }).toBuffer()
        : await pipeline.jpeg({ quality: 95, mozjpeg: true }).toBuffer();

  return {
    buffer: encoded,
    contentType: CONTENT_TYPES[metadata.format]!,
    filename: `template${EXTENSIONS[metadata.format]}`,
    width: metadata.width,
    height: metadata.height,
  };
}

/** Uploads the artwork once; the template document only keeps the returned id. */
export function storePreparedImage(image: PreparedImage): Promise<Types.ObjectId> {
  return uploadTemplateImage(image.buffer, image.contentType, image.filename);
}

/** GridFS is the source of truth; `imageKey` marks a pre-migration template. */
export function usesGridfs(template: TemplateImageRef): boolean {
  return template.imageFileId != null;
}

/**
 * The artwork as bytes, for compositing a design. Loaded once per request and
 * never persisted.
 */
export async function readTemplateArtwork(template: TemplateImageRef): Promise<Buffer> {
  if (usesGridfs(template)) return readTemplateImageBuffer(assertImageFileId(template.imageFileId));
  if (!template.imageKey) throw new ApiError("TEMPLATE_IMAGE_NOT_FOUND", 404);

  return storage.readTemplateImage(template.imageKey);
}

export type ArtworkResponse = {
  stream: Readable;
  contentType: string;
  /** Byte length, so the response can carry Content-Length. */
  length: number;
};

/**
 * Streams the artwork for the editor. GridFS metadata supplies the real content
 * type; a legacy file falls back to its extension, so nothing breaks before the
 * migration has run.
 */
export async function streamTemplateArtwork(template: TemplateImageRef): Promise<ArtworkResponse> {
  if (usesGridfs(template)) {
    const fileId = assertImageFileId(template.imageFileId);
    const meta = await getTemplateImageMeta(fileId);
    if (!meta) throw new ApiError("TEMPLATE_IMAGE_NOT_FOUND", 404);

    return { stream: await openTemplateImageStream(fileId), contentType: meta.contentType, length: meta.length };
  }

  if (!template.imageKey) throw new ApiError("TEMPLATE_IMAGE_NOT_FOUND", 404);
  const buffer = await storage.readTemplateImage(template.imageKey);

  return {
    stream: Readable.from(buffer),
    contentType: contentTypeFromFilename(template.imageKey),
    length: buffer.length,
  };
}

/** Deletes whichever store holds this template's artwork. */
export async function deleteTemplateArtwork(template: TemplateImageRef): Promise<void> {
  if (usesGridfs(template)) {
    await deleteTemplateImage(assertImageFileId(template.imageFileId));
    return;
  }

  if (template.imageKey) await storage.removeTemplateImage(template.imageKey);
}

function contentTypeFromFilename(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "webp") return "image/webp";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return "image/png";
}