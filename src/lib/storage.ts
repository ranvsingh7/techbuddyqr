import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type sharp from "sharp";
import type { Sharp } from "sharp";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api-error";
import { MAX_IMAGE_SIDE, MAX_UPLOAD_BYTES } from "@/lib/limits";

/**
 * Sharp is loaded on first use rather than at import time. Loading libvips costs
 * real time on a cold function, and this module is reachable from plain listing
 * pages (`/admin/templates`, `/admin/qr/[id]`) that never touch a pixel.
 */
async function loadSharp(): Promise<typeof sharp> {
  // sharp is CommonJS, so the constructor arrives on `.default` under ESM
  // interop and directly otherwise.
  const mod = (await import("sharp")) as { default?: typeof sharp };
  return mod.default ?? (mod as unknown as typeof sharp);
}

const TEMPLATES_DIR = "templates";
const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);
const EXTENSIONS: Record<string, string> = { png: ".png", jpeg: ".jpg", webp: ".webp" };

function templatesRoot(): string {
  return path.resolve(env().storageDir, TEMPLATES_DIR);
}

/**
 * Resolves a storage key to an absolute path, refusing anything that is not a
 * plain file name or that would escape the templates directory.
 */
function resolveKey(key: string): string {
  const root = templatesRoot();
  const resolved = path.resolve(root, key);
  if (!/^[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(key) || path.dirname(resolved) !== root) {
    throw new ApiError("VALIDATION_ERROR", 400, { image: "Invalid image reference" });
  }
  return resolved;
}

async function writeImage(absolutePath: string, pipeline: Sharp): Promise<void> {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, await pipeline.toBuffer());
}

/**
 * Filesystem storage for template artwork. Swap this module for an S3 or
 * Cloudinary implementation later without touching any business logic.
 */
export const storage = {
  /**
   * Validates the declared type, decodes with sharp and re-encodes the image, so
   * only real image data is ever written to disk.
   */
  async saveTemplateImage(file: File): Promise<{ key: string; width: number; height: number }> {
    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      throw new ApiError("VALIDATION_ERROR", 400, { image: "Image must be under 8 MB" });
    }

    const declaredType = file.type.toLowerCase();
    if (!declaredType.startsWith("image/")) {
      throw new ApiError("VALIDATION_ERROR", 400, { image: "Only PNG, JPG or WEBP images are allowed" });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sharp = await loadSharp();
    const image = sharp(buffer, { limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE });
    const metadata = await image.metadata().catch(() => null);

    if (!metadata?.format || !ALLOWED_FORMATS.has(metadata.format)) {
      throw new ApiError("VALIDATION_ERROR", 400, { image: "Only PNG, JPG or WEBP images are allowed" });
    }
    if (metadata.width > MAX_IMAGE_SIDE || metadata.height > MAX_IMAGE_SIDE) {
      throw new ApiError("VALIDATION_ERROR", 400, { image: `Image must be at most ${MAX_IMAGE_SIDE}px on each side` });
    }

    const key = `${randomUUID()}${EXTENSIONS[metadata.format]}`;
    const absolutePath = resolveKey(key);
    const pipeline = sharp(buffer, { limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE }).rotate();

    if (metadata.format === "png") await writeImage(absolutePath, pipeline.png({ compressionLevel: 9 }));
    else if (metadata.format === "webp") await writeImage(absolutePath, pipeline.webp({ quality: 95 }));
    else await writeImage(absolutePath, pipeline.jpeg({ quality: 95, mozjpeg: true }));

    return { key, width: metadata.width, height: metadata.height };
  },

  async readTemplateImage(key: string): Promise<Buffer> {
    return readFile(resolveKey(key));
  },

  async removeTemplateImage(key: string): Promise<void> {
    await rm(resolveKey(key), { force: true });
  },
};
