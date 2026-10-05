import JSZip from "jszip";
import { renderDesign } from "@/image/compose";
import { getTemplateWithImage } from "@/services/template";
import { readTemplateArtwork } from "@/lib/template-image";
import { findExistingQrIds } from "@/services/qr";
import { QR } from "@/models/QR";
import { ApiError } from "@/lib/api-error";

/**
 * Loads a template and its single base artwork, ready for composition.
 *
 * Called once per request: a batch of a hundred codes reads the one stored image
 * and reuses the same buffer, rather than downloading it per code.
 */
async function loadTemplate(templateId: string) {
  const template = await getTemplateWithImage(templateId);
  return { template, baseImage: await readTemplateArtwork(template) };
}

/**
 * Remembers which template a QR was printed from, so a template in use cannot be
 * deleted out from under its designs. This stores a reference only; the artwork
 * stays on the template document.
 */
async function recordTemplate(templateObjectId: unknown, qrIds: string[]): Promise<void> {
  await QR.updateMany({ qrId: { $in: qrIds } }, { $set: { templateId: templateObjectId } }, { timestamps: false });
}

/** Refuses IDs that were never generated, so a card can never be printed for nothing. */
async function requireKnownQrIds(qrIds: string[]): Promise<string[]> {
  const unique = [...new Set(qrIds.map((qrId) => qrId.toUpperCase()))];
  const known = await findExistingQrIds(unique);
  const missing = unique.filter((qrId) => !known.has(qrId));

  if (missing.length > 0) {
    throw new ApiError("QR_NOT_FOUND", 404, undefined, `Unknown QR codes: ${missing.join(", ")}`);
  }

  return unique;
}

export async function renderQrDesign(templateId: string, qrId: string): Promise<Buffer> {
  const [known] = await requireKnownQrIds([qrId]);
  const { template, baseImage } = await loadTemplate(templateId);

  const design = await renderDesign({
    baseImage,
    overlay: template.overlay,
    qrId: known!,
    lightPlate: template.lightPlate,
  });

  await recordTemplate(template._id, [known!]);
  return design;
}

/**
 * Builds the print-ready ZIP for a batch. Files are named after their QR ID so a
 * shopkeeper can tell the cards apart without opening anything. Nothing is
 * written to disk: the designs exist only in the returned archive.
 */
export async function renderDesignZip(templateId: string, qrIds: string[]): Promise<Buffer> {
  const unique = await requireKnownQrIds(qrIds);
  const { template, baseImage } = await loadTemplate(templateId);
  const zip = new JSZip();

  // One stored image, one buffer, reused for every code in the batch.
  for (const qrId of unique) {
    const design = await renderDesign({
      baseImage,
      overlay: template.overlay,
      qrId,
      lightPlate: template.lightPlate,
    });
    zip.file(`${qrId}.png`, design);
  }

  await recordTemplate(template._id, unique);

  return zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
}

/** `qr-batch-20261003.zip` */
export function designZipName(prefix: string): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}.zip`;
}
