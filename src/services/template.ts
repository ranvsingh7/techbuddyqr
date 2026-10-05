import { Types } from "mongoose";
import { ApiError } from "@/lib/api-error";
import { storage } from "@/lib/storage";
import { deleteTemplateImage } from "@/lib/gridfs";
import {
  deleteTemplateArtwork,
  prepareTemplateImage,
  readTemplateArtwork,
  storePreparedImage,
} from "@/lib/template-image";
import {
  REFERENCE_ID,
  clampQr,
  defaultTextFor,
  normalizeOverlay,
  overlayFromStored,
  placementFromQr,
  type LegacyPlacement,
  type TemplateOverlay,
  type TextLayer,
} from "@/qr/overlay";
import { QR } from "@/models/QR";
import { Template } from "@/models/Template";
import type { DestinationType } from "@/types";

export type TemplateInput = {
  name: string;
  type: DestinationType | null;
  /** Both layers. Clients predating the two-layer editor send `qrPosition`. */
  overlay?: TemplateOverlay;
  qrPosition?: LegacyPlacement;
  lightPlate: boolean;
};

export type TemplatePatch = {
  name?: string;
  type?: DestinationType | null;
  lightPlate?: boolean;
  /** Either layer may be sent on its own. */
  overlay?: { qr?: Partial<TemplateOverlay["qr"]>; text?: Partial<TextLayer> };
  /** Pre-overlay clients: a legacy rectangle, upgraded to a two-layer overlay. */
  qrPosition?: LegacyPlacement;
};

type Stored = {
  overlay?: TemplateOverlay | null;
  qrPosition?: LegacyPlacement;
  imageWidth: number;
  imageHeight: number;
};

const imageBox = (template: { imageWidth: number; imageHeight: number }) => ({
  width: template.imageWidth,
  height: template.imageHeight,
});

/**
 * The two layers of a template, whatever shape it was saved in.
 *
 * Documents written before the two-layer editor only have `qrPosition`; those
 * keep their QR square exactly as it was and get a sensible ID printed below it.
 */
export function resolveOverlay(template: Stored): TemplateOverlay {
  return overlayFromStored(template, imageBox(template), REFERENCE_ID);
}

/** Legacy rectangle -> QR square, with the ID placed underneath it. */
function overlayFromLegacy(qrPosition: LegacyPlacement, image: { width: number; height: number }): TemplateOverlay {
  const qr = clampQr({ x: qrPosition.x, y: qrPosition.y, size: Math.min(qrPosition.width, qrPosition.height) }, image);
  return normalizeOverlay({ qr, text: defaultTextFor(qr, image, REFERENCE_ID) }, image, REFERENCE_ID);
}

/**
 * Creates a template and stores its artwork exactly once, in GridFS.
 *
 * The QR documents that later point at this template reference the same file;
 * no image is ever copied into them. If the document insert fails the uploaded
 * file is removed again, so a rejected request leaves nothing behind.
 */
export async function createTemplate(input: TemplateInput, file: File) {
  const image = await prepareTemplateImage(file);
  const imageFileId = await storePreparedImage(image);

  try {
    // Inside the try: a rejected request must not leave the upload behind.
    const overlay = input.overlay
      ? normalizeOverlay(input.overlay, image, REFERENCE_ID)
      : overlayFromLegacy(input.qrPosition!, image);

    // `.toObject()` first: `_id` and the timestamps are prototype getters on a
    // hydrated document and would be lost by destructuring it directly.
    const { imageFileId: _fileId, imageKey: _key, ...created } = (await Template.create({
      name: input.name,
      type: input.type,
      imageFileId,
      imageKey: null,
      imageWidth: image.width,
      imageHeight: image.height,
      overlay,
      // Legacy mirror, so anything still reading the old field keeps working.
      qrPosition: placementFromQr(overlay.qr),
      lightPlate: input.lightPlate,
    })).toObject();

    return created;
  } catch (error) {
    await deleteTemplateImage(imageFileId);
    throw error;
  }
}

export async function listTemplates() {
  const templates = await Template.find().sort({ createdAt: -1 }).lean();

  // Storage locations are internal, so they never leave the service.
  return templates.map(({ imageFileId: _fileId, imageKey: _key, ...template }) => ({
    ...template,
    overlay: resolveOverlay(template),
  }));
}

export async function getTemplate(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError("TEMPLATE_NOT_FOUND", 404);

  const template = await Template.findById(id).lean();
  if (!template) return null;

  const { imageFileId: _fileId, imageKey: _key, ...rest } = template;
  return { ...rest, overlay: resolveOverlay(template) };
}

/** Internal read that keeps the storage locations, for image and design work. */
export async function getTemplateWithImage(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError("TEMPLATE_NOT_FOUND", 404);

  const template = await Template.findById(id).lean();
  if (!template) throw new ApiError("TEMPLATE_NOT_FOUND", 404);

  return { ...template, overlay: resolveOverlay(template) };
}

/** The base artwork for this template, loaded from GridFS (or its legacy file). */
export async function getTemplateArtwork(id: string) {
  return readTemplateArtwork(await getTemplateWithImage(id));
}

/**
 * Moves the overlay and the name. Nothing here touches the artwork, so editing
 * a placement never re-uploads the image.
 */
export async function updateTemplate(id: string, patch: TemplatePatch) {
  const template = await getTemplateWithImage(id);

  const image = imageBox(template);
  const current = resolveOverlay(template);
  let next = current;

  if (patch.qrPosition && !patch.overlay) {
    // An old client moving its QR block: the text layer stays where it is.
    next = { ...current, qr: clampQr({ x: patch.qrPosition.x, y: patch.qrPosition.y, size: Math.min(patch.qrPosition.width, patch.qrPosition.height) }, image) };
  }

  if (patch.overlay) {
    next = {
      qr: { ...current.qr, ...patch.overlay.qr },
      text: { ...current.text, ...patch.overlay.text },
    };
  }

  const overlay = normalizeOverlay(next, image, REFERENCE_ID);
  const changes: Record<string, unknown> = { overlay, qrPosition: placementFromQr(overlay.qr) };

  if (patch.name !== undefined) changes.name = patch.name;
  if (patch.type !== undefined) changes.type = patch.type;
  if (patch.lightPlate !== undefined) changes.lightPlate = patch.lightPlate;

  const saved = await Template.findByIdAndUpdate(template._id, { $set: changes }, { returnDocument: "after" }).lean();
  if (!saved) return null;

  const { imageFileId: _fileId, imageKey: _key, ...rest } = saved;
  return { ...rest, overlay: resolveOverlay(saved) };
}

/**
 * Swaps the base image for a new one.
 *
 * The new file is uploaded first and only becomes the template's image once the
 * update succeeds; the previous file is deleted afterwards, so a failure at any
 * point leaves the template with the image it already had and never orphans a
 * file. The overlay is re-clamped because the artwork may be a different size.
 */
export async function replaceTemplateImage(id: string, file: File) {
  const template = await getTemplateWithImage(id);
  const image = await prepareTemplateImage(file);
  const imageFileId = await storePreparedImage(image);
  const previous = { imageFileId: template.imageFileId, imageKey: template.imageKey };
  const overlay = normalizeOverlay(resolveOverlay(template), image, REFERENCE_ID);

  // If the update throws the template still points at its old file, so the new
  // upload is an orphan and has to go. This runs before any success handling so
  // a failure here can never touch the file the template now uses.
  const updated = await updateImageFile(template._id, imageFileId, image, overlay);
  if (!updated) {
    await deleteTemplateImage(imageFileId);
    throw new ApiError("TEMPLATE_NOT_FOUND", 404);
  }

  // The template now points at the new file, so the old one is safe to remove.
  if (previous.imageFileId) await deleteTemplateImage(previous.imageFileId);
  else if (previous.imageKey) await storage.removeTemplateImage(previous.imageKey);

  const { imageFileId: _fileId, imageKey: _key, ...rest } = updated;
  return { ...rest, overlay: resolveOverlay(updated) };
}

async function updateImageFile(
  id: Types.ObjectId,
  imageFileId: Types.ObjectId,
  image: { width: number; height: number },
  overlay: TemplateOverlay,
) {
  try {
    return await Template.findByIdAndUpdate(
      id,
      {
        $set: {
          imageFileId,
          imageKey: null,
          imageWidth: image.width,
          imageHeight: image.height,
          overlay,
          qrPosition: placementFromQr(overlay.qr),
        },
      },
      { returnDocument: "after" },
    ).lean();
  } catch (error) {
    await deleteTemplateImage(imageFileId);
    throw error;
  }
}

/**
 * Deletes a template only when nothing references it. QRs store a templateId,
 * not a copy of the artwork, so a template in use is blocked rather than
 * quietly orphaning every design printed from it.
 */
export async function deleteTemplate(id: string) {
  const template = await getTemplateWithImage(id);

  const qrCount = await QR.countDocuments({ templateId: template._id });
  if (qrCount > 0) {
    throw new ApiError(
      "TEMPLATE_IN_USE",
      409,
      { qrCount },
      `Template is currently used by ${qrCount} QR code${qrCount === 1 ? "" : "s"} and cannot be deleted.`,
    );
  }

  // The document goes first: an image left behind costs space, whereas a
  // template still pointing at a deleted image would break every design
  // printed from it.
  await Template.findByIdAndDelete(template._id);
  await deleteTemplateArtwork(template);
}