import sharp, { type OverlayOptions } from "sharp";
import { renderQr } from "@/qr/render";
import { normalizeOverlay, textAnchorOnCanvas, textBoxFor, type TemplateOverlay } from "@/qr/overlay";
import { ID_FONT_FAMILY, ID_FONT_WEIGHT } from "@/qr/text-metrics";
import { MAX_IMAGE_SIDE } from "@/lib/limits";

export type { QrLayer, TextAlignment, TextLayer, TemplateOverlay } from "@/qr/overlay";
export { normalizeOverlay, overlayFromStored, placementFromQr } from "@/qr/overlay";

const round = (value: number) => Math.round(value);

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => `&#${character.charCodeAt(0)};`);
}

function svgLayer(width: number, height: number, body: string): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );
}

/** Layer 1 support: a white plate behind the QR square only, never around the ID. */
function qrPlateLayer(width: number, height: number, overlay: TemplateOverlay): Buffer {
  const { x, y, size } = overlay.qr;

  return svgLayer(
    width,
    height,
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${Math.round(size * 0.04)}" fill="#ffffff"/>`,
  );
}

/**
 * Layer 2: the printed QR ID as its own SVG, positioned by the text layer alone.
 *
 * `text.x` / `text.y` are the top-left of the bounding box, exactly as in the
 * editor. Alignment moves the anchor inside that box, and rotation happens
 * around the box centre, so a rotated design prints where the preview showed it.
 *
 * The em box is centred vertically (`dominant-baseline="central"`), which is what
 * the editor's flex box draws, so preview and print agree on both axes.
 */
function textLayer(width: number, height: number, overlay: TemplateOverlay, qrId: string): Buffer {
  const { text } = overlay;
  const box = textBoxFor(text, qrId);

  const anchor = textAnchorOnCanvas(text, qrId, width);
  const centreY = text.y + box.height / 2;
  const centreX = text.x + box.width / 2;

  const anchorMode = text.alignment === "left" ? "start" : text.alignment === "right" ? "end" : "middle";
  const rotation = text.rotation === 0 ? "" : ` transform="rotate(${text.rotation} ${round(centreX)} ${round(centreY)})"`;

  return svgLayer(
    width,
    height,
    `<text x="${round(anchor)}" y="${round(centreY)}"${rotation} text-anchor="${anchorMode}" dominant-baseline="central" font-family="${ID_FONT_FAMILY}" font-size="${text.fontSize}" font-weight="${ID_FONT_WEIGHT}" fill="#000000" xml:space="preserve">${escapeXml(qrId)}</text>`,
  );
}

/**
 * Builds one print-ready PNG from three independent pieces:
 *
 *   base artwork  +  QR layer (its own bitmap)  +  QR ID layer (its own SVG)
 *
 * The two overlays are never combined into a single image, so either one can sit
 * anywhere on the artwork without dragging the other along.
 */
export async function renderDesign(params: {
  baseImage: Buffer;
  overlay: TemplateOverlay;
  qrId: string;
  lightPlate?: boolean;
}): Promise<Buffer> {
  const metadata = await sharp(params.baseImage, { limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE })
    .metadata()
    .catch(() => null);

  if (!metadata?.width || !metadata.height) throw new Error("Template image could not be decoded");

  const { width, height } = metadata;
  const overlay = normalizeOverlay(params.overlay, { width, height }, params.qrId);
  const qr = await renderQr(params.qrId, overlay.qr.size, { dotStyle: overlay.qr.dotStyle, icon: overlay.qr.icon });

  const layers: OverlayOptions[] = [];

  if (params.lightPlate !== false) {
    layers.push({ input: qrPlateLayer(width, height, overlay), top: 0, left: 0 });
  }

  // Whole-pixel modules centred in the configured square: never distorted, never
  // larger than the box the admin placed.
  layers.push({
    input: qr.buffer,
    top: overlay.qr.y + Math.floor((overlay.qr.size - qr.size) / 2),
    left: overlay.qr.x + Math.floor((overlay.qr.size - qr.size) / 2),
  });

  layers.push({ input: textLayer(width, height, overlay, params.qrId), top: 0, left: 0 });

  return sharp(params.baseImage, { limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toBuffer();
}
