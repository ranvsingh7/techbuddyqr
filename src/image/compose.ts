import sharp, { type OverlayOptions } from "sharp";
import * as fontkit from "fontkit";
import path from "node:path";
import { renderQr } from "@/qr/render";
import { normalizeOverlay, textBoxFor, type TemplateOverlay } from "@/qr/overlay";
import { MAX_IMAGE_SIDE } from "@/lib/limits";

export type { QrLayer, TextAlignment, TextLayer, TemplateOverlay } from "@/qr/overlay";
export { normalizeOverlay, overlayFromStored, placementFromQr } from "@/qr/overlay";

const round = (value: number) => Math.round(value);

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

const ID_GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"], B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"], D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"], F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"], H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"], K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"], M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"], P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"], R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"], T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"], V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"], X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"], Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"], "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"], "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"], "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"], "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
};

function qrIdGlyphLayer(overlay: TemplateOverlay, qrId: string): string {
  const { text } = overlay;
  const box = textBoxFor(text, qrId);
  const fontPath = path.join(process.cwd(), "node_modules/@fontsource/roboto/files/roboto-latin-700-normal.woff2");
  const font = fontkit.openSync(fontPath) as import("fontkit").Font;
  const layout = font.layout(qrId);
  const scale = Math.min(text.fontSize / font.unitsPerEm, box.width / layout.advanceWidth);
  const runHeight = (font.ascent - font.descent) * scale;
  let cursor = 0;
  const positionedGlyphs = layout.glyphs.map((glyph, index) => {
    const position = layout.positions[index];
    const x = cursor + (position?.xOffset ?? 0);
    cursor += position?.xAdvance ?? glyph.advanceWidth;
    return { glyph, position, x };
  });
  const visualMin = Math.min(...positionedGlyphs.map(({ glyph, x }) => x + glyph.bbox.minX));
  const visualMax = Math.max(...positionedGlyphs.map(({ glyph, x }) => x + glyph.bbox.maxX));
  const visualWidth = (visualMax - visualMin) * scale;
  const visualLeft = text.alignment === "left" ? text.x : text.alignment === "right" ? text.x + box.width - visualWidth : text.x + (box.width - visualWidth) / 2;
  const left = Math.round(visualLeft - visualMin * scale);
  const baseline = Math.round(text.y + (box.height - runHeight) / 2 + font.ascent * scale);
  const paths: string[] = [];

  positionedGlyphs.forEach(({ glyph, position, x }) => {
    paths.push(`<path d="${glyph.path.toSVG()}" transform="translate(${left + x * scale} ${baseline + (position?.yOffset ?? 0) * scale}) scale(${scale} ${-scale})"/>`);
  });

  const rotation = text.rotation === 0 ? "" : ` transform="rotate(${round(text.rotation)} ${round(text.x + box.width / 2)} ${round(text.y + box.height / 2)})"`;
  return `<g fill="#000000"${rotation}>${paths.join("")}</g>`;
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

  return svgLayer(
    width,
    height,
    qrIdGlyphLayer(overlay, qrId),
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
