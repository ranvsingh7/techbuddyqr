import JSZip from "jszip";
import { storage } from "@/lib/storage";
import { renderDesign } from "@/image/compose";
import { getTemplate } from "@/services/template";
import { findExistingQrIds } from "@/services/qr";
import { ApiError } from "@/lib/api-error";

/** Loads a template and its base artwork, ready for composition. */
async function loadTemplate(templateId: string) {
  const template = await getTemplate(templateId);
  if (!template) throw new ApiError("TEMPLATE_NOT_FOUND", 404);
  return { template, baseImage: await storage.readTemplateImage(template.imageKey) };
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

  return renderDesign({
    baseImage,
    overlay: template.overlay,
    qrId: known!,
    lightPlate: template.lightPlate,
  });
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

  for (const qrId of unique) {
    const design = await renderDesign({
      baseImage,
      overlay: template.overlay,
      qrId,
      lightPlate: template.lightPlate,
    });
    zip.file(`${qrId}.png`, design);
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
}

/** `qr-batch-20261003.zip` */
export function designZipName(prefix: string): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}.zip`;
}
