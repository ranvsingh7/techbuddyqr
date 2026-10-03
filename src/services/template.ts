import { Types } from "mongoose";
import { ApiError } from "@/lib/api-error";
import { storage } from "@/lib/storage";
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

export async function createTemplate(input: TemplateInput, file: File) {
  const image = await storage.saveTemplateImage(file);

  try {
    // Inside the try: a rejected request must not leave the upload on disk.
    const overlay = input.overlay
      ? normalizeOverlay(input.overlay, image, REFERENCE_ID)
      : overlayFromLegacy(input.qrPosition!, image);

    return await Template.create({
      name: input.name,
      type: input.type,
      imageKey: image.key,
      imageWidth: image.width,
      imageHeight: image.height,
      overlay,
      // Legacy mirror, so anything still reading the old field keeps working.
      qrPosition: placementFromQr(overlay.qr),
      lightPlate: input.lightPlate,
    });
  } catch (error) {
    await storage.removeTemplateImage(image.key);
    throw error;
  }
}

export async function listTemplates() {
  const templates = await Template.find().sort({ createdAt: -1 }).lean();
  return templates.map((template) => ({ ...template, overlay: resolveOverlay(template) }));
}

export async function getTemplate(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError("TEMPLATE_NOT_FOUND", 404);

  const template = await Template.findById(id).lean();
  if (!template) return null;

  return { ...template, overlay: resolveOverlay(template) };
}

export async function updateTemplate(id: string, patch: TemplatePatch) {
  const template = await getTemplate(id);
  if (!template) throw new ApiError("TEMPLATE_NOT_FOUND", 404);

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
  return saved ? { ...saved, overlay: resolveOverlay(saved) } : null;
}

export async function deleteTemplate(id: string) {
  const template = await getTemplate(id);
  if (!template) throw new ApiError("TEMPLATE_NOT_FOUND", 404);

  await Template.findByIdAndDelete(template._id).lean();
  await storage.removeTemplateImage(template.imageKey);
}
