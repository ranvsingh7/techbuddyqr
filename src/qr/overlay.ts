/**
 * The template overlay: two completely independent layers on top of the artwork.
 *
 *   overlay.qr   -> the QR code itself, always a square, stored as x/y/size
 *   overlay.text -> the printed QR ID, stored as x/y/fontSize/rotation/alignment
 *
 * Every number is in ORIGINAL IMAGE PIXELS. The editor converts pointer
 * positions into this space before calling anything here, so nothing in this
 * module knows anything about screen pixels, and the renderer can place the two
 * layers without ever combining them.
 *
 * Coordinate system, used identically by the editor, the database and the
 * renderer:
 *
 *   qr   -> x/y is the top-left corner of the square, side length `size`
 *   text -> x/y is the top-left corner of the (unrotated) text bounding box,
 *           which is `measure(id, fontSize)` wide and `fontSize * 1.2` tall.
 *           The box rotates around its own centre.
 */

import { measureTextWidth, textBoxHeight, TEXT_LINE_HEIGHT } from "@/qr/text-metrics";

export type TextAlignment = "left" | "center" | "right";
export type QrLayer = { x: number; y: number; size: number };
export type TextLayer = { x: number; y: number; fontSize: number; rotation: number; alignment: TextAlignment };
export type TemplateOverlay = { qr: QrLayer; text: TextLayer };

export type ImageBox = { width: number; height: number };
export type Point = { x: number; y: number };
export type Corner = "nw" | "ne" | "sw" | "se";

export const TEXT_ALIGNMENTS: TextAlignment[] = ["left", "center", "right"];

/** Smallest QR we will print, in original image pixels. */
export const MIN_QR_SIZE = 64;
/** Smallest readable printed ID, in original image pixels. */
export const MIN_TEXT_SIZE = 8;

/**
 * ID used to measure and clamp the text layer. Every printed ID has the same
 * length and alphabet, so one reference keeps the stored numbers stable; the
 * renderer still measures the real ID when it draws.
 */
export const REFERENCE_ID = "QR7K29XA";

const clamp = (value: number, min: number, max: number) => {
  // A value that is not a number cannot be placed, so it falls back to the lower bound.
  const safe = Number.isFinite(value) ? value : min;

  return Math.min(Math.max(safe, min), max);
};
const round = (value: number) => Math.round(value);

/** Turns a local offset into world coordinates around `centre`. */
const rotate = (offset: Point, cos: number, sin: number, centre: Point): Point => ({
  x: centre.x + offset.x * cos - offset.y * sin,
  y: centre.y + offset.x * sin + offset.y * cos,
});

/** Legacy shape kept in MongoDB so templates saved before the two-layer editor keep working. */
export type LegacyPlacement = { x: number; y: number; width: number; height: number };

export type TextBox = { width: number; height: number };

/** Bounding box of a printed ID, before rotation. */
export function textBoxFor(text: TextLayer, value: string): TextBox {
  return { width: Math.max(1, measureTextWidth(value, text.fontSize)), height: Math.max(1, textBoxHeight(text.fontSize)) };
}

/** Advance width per pixel of font size, so sizes can be solved for exactly. */
function widthRatio(value: string): number {
  return measureTextWidth(value, 1000) / 1000;
}

/** Axis-aligned size of the rotated text box. */
export function rotatedExtent(text: TextLayer, value: string): { width: number; height: number } {
  const radians = (text.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const box = textBoxFor(text, value);

  return {
    width: box.width * cos + box.height * sin,
    height: box.width * sin + box.height * cos,
  };
}

/** Folds any angle into (-180, 180] so -45 stays -45 and 270 becomes -90. */
export function normalizeRotation(degrees: number): number {
  const folded = ((Math.round(degrees) % 360) + 360) % 360;
  return folded > 180 ? folded - 360 : folded;
}

/** Largest font size whose rotated box still fits the artwork. */
export function maxFontSize(image: ImageBox, value: string, rotation = 0): number {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const ratio = widthRatio(value);

  const byWidth = ratio * cos + TEXT_LINE_HEIGHT * sin;
  const byHeight = ratio * sin + TEXT_LINE_HEIGHT * cos;

  const limit = Math.min(byWidth > 0 ? image.width / byWidth : Infinity, byHeight > 0 ? image.height / byHeight : Infinity);
  return Math.max(MIN_TEXT_SIZE, Math.floor(limit));
}

/** Keeps a square QR of `size` px inside the artwork. */
export function clampQr(qr: QrLayer, image: ImageBox): QrLayer {
  const size = round(clamp(qr.size, Math.min(MIN_QR_SIZE, image.width, image.height), Math.min(image.width, image.height)));

  return {
    x: round(clamp(qr.x, 0, Math.max(0, image.width - size))),
    y: round(clamp(qr.y, 0, Math.max(0, image.height - size))),
    size,
  };
}

/**
 * Keeps the text inside the artwork. The check uses the ROTATED extent, and the
 * box centre is what gets clamped, so rotating never pushes text off the page.
 */
export function clampText(text: TextLayer, image: ImageBox, value: string): TextLayer {
  const rotation = normalizeRotation(text.rotation);
  const fontSize = round(clamp(text.fontSize, MIN_TEXT_SIZE, maxFontSize(image, value, rotation)));
  const box = textBoxFor({ ...text, fontSize, rotation }, value);
  const extent = rotatedExtent({ ...text, fontSize, rotation }, value);

  const centreX = clamp(text.x + box.width / 2, extent.width / 2, Math.max(extent.width / 2, image.width - extent.width / 2));
  const centreY = clamp(text.y + box.height / 2, extent.height / 2, Math.max(extent.height / 2, image.height - extent.height / 2));

  return {
    x: round(centreX - box.width / 2),
    y: round(centreY - box.height / 2),
    fontSize,
    rotation,
    alignment: TEXT_ALIGNMENTS.includes(text.alignment) ? text.alignment : "center",
  };
}

/** Normalises an overlay against the real artwork size. Never throws, always valid. */
export function normalizeOverlay(overlay: TemplateOverlay, image: ImageBox, value: string): TemplateOverlay {
  return {
    qr: clampQr(overlay.qr, image),
    text: clampText(overlay.text, image, value),
  };
}

/** Moves the QR by a delta in image pixels. */
export function moveQr(qr: QrLayer, image: ImageBox, dx: number, dy: number): QrLayer {
  return clampQr({ ...qr, x: qr.x + dx, y: qr.y + dy }, image);
}

/**
 * Resizes the QR from one corner, keeping the opposite corner pinned.
 *
 * The result is always square, so one size has to win: the block follows whichever
 * axis the pointer moved furthest on, and both edges are measured from the pinned
 * corner. That way the corner the admin is holding never drifts, even when the
 * artwork is not square and the pointer is not moving on a perfect diagonal.
 */
export function resizeQrFromCorner(qr: QrLayer, image: ImageBox, corner: Corner, point: Point): QrLayer {
  const right = corner.includes("e");
  const bottom = corner.startsWith("s");

  const fixedX = right ? qr.x : qr.x + qr.size;
  const fixedY = bottom ? qr.y : qr.y + qr.size;

  const rawX = right ? point.x - fixedX : fixedX - point.x;
  const rawY = bottom ? point.y - fixedY : fixedY - point.y;

  // Clamp before positioning, so dragging a corner past the pinned one keeps it pinned.
  const size = Math.round(clamp(Math.max(rawX, rawY), Math.min(MIN_QR_SIZE, image.width, image.height), Math.min(image.width, image.height)));

  return clampQr({ x: right ? fixedX : fixedX - size, y: bottom ? fixedY : fixedY - size, size }, image);
}

/** Moves the printed ID by a delta in image pixels. Rotation is untouched. */
export function moveText(text: TextLayer, image: ImageBox, value: string, dx: number, dy: number): TextLayer {
  return clampText({ ...text, x: text.x + dx, y: text.y + dy }, image, value);
}

/** Rotates the printed ID around its own centre, then keeps it inside the artwork. */
export function rotateText(text: TextLayer, image: ImageBox, value: string, rotation: number, centre?: Point): TextLayer {
  const box = textBoxFor(text, value);
  const anchorX = centre?.x ?? text.x + box.width / 2;
  const anchorY = centre?.y ?? text.y + box.height / 2;

  return clampText({ ...text, x: anchorX - box.width / 2, y: anchorY - box.height / 2, rotation }, image, value);
}

/** Centre of the text box in image pixels. */
export function textCentre(text: TextLayer, value: string): Point {
  const box = textBoxFor(text, value);
  return { x: text.x + box.width / 2, y: text.y + box.height / 2 };
}

/** Corner of the (unrotated) text box in image pixels. */
export function textCorner(text: TextLayer, value: string, corner: Corner): Point {
  const box = textBoxFor(text, value);
  const x = corner.includes("w") ? text.x : text.x + box.width;
  const y = corner.startsWith("n") ? text.y : text.y + box.height;
  return { x, y };
}

/**
 * Resizes the printed ID from one corner, keeping the opposite corner pinned.
 *
 * The pointer is first turned into the box's own rotated frame, so dragging a
 * handle sideways never has to fight the rotation. Font size scales with the
 * larger of the two axes, which keeps the text proportional and stops it from
 * collapsing to nothing when the pointer is dragged diagonally inwards.
 */
export function resizeTextFromCorner(text: TextLayer, image: ImageBox, value: string, corner: Corner, point: Point): TextLayer {
  const radians = (text.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const box = textBoxFor(text, value);
  const centre = { x: text.x + box.width / 2, y: text.y + box.height / 2 };
  const right = corner.includes("e");
  const bottom = corner.startsWith("s");

  // The handle the admin is holding, in world coordinates.
  const handle = rotate({ x: right ? box.width / 2 : -box.width / 2, y: bottom ? box.height / 2 : -box.height / 2 }, cos, sin, centre);

  // Pointer travel expressed along the box's own axes, so a rotated text is
  // dragged the way it looks rather than the way it happens to be stored.
  const travel = rotate({ x: point.x - handle.x, y: point.y - handle.y }, cos, sin, { x: 0, y: 0 });
  const growthX = (right ? travel.x : -travel.x) / (box.width / 2);
  const growthY = (bottom ? travel.y : -travel.y) / (box.height / 2);

  // Scale by the axis the pointer has travelled furthest along, and never past
  // the point where the held handle would cross the pinned one.
  const factor = Math.max(1 + Math.max(growthX, growthY), MIN_TEXT_SIZE / Math.max(1, text.fontSize));
  const fontSize = round(clamp(text.fontSize * factor, MIN_TEXT_SIZE, maxFontSize(image, value, text.rotation)));
  const next = textBoxFor({ ...text, fontSize }, value);

  // Pin the opposite corner. Working from that corner, rather than from the
  // centre, is what keeps it still while the text grows or shrinks; working in
  // the rotated frame is what keeps it still once the text is turned.
  const opposite = rotate({ x: right ? -box.width / 2 : box.width / 2, y: bottom ? -box.height / 2 : box.height / 2 }, cos, sin, centre);
  const nextOpposite = rotate({ x: right ? -next.width / 2 : next.width / 2, y: bottom ? -next.height / 2 : next.height / 2 }, cos, sin, { x: 0, y: 0 });
  const nextCentre = { x: opposite.x - nextOpposite.x, y: opposite.y - nextOpposite.y };

  return clampText({ ...text, fontSize, x: nextCentre.x - next.width / 2, y: nextCentre.y - next.height / 2 }, image, value);
}

/** Font size implied by a horizontal drag distance, used by the editor's drag math. */
export function fontSizeFromScale(text: TextLayer, image: ImageBox, value: string, scale: number): number {
  return round(clamp(text.fontSize * scale, MIN_TEXT_SIZE, maxFontSize(image, value, text.rotation)));
}

/**
 * Anchor for the value actually being printed, kept on the canvas.
 *
 * The editor sizes the text box from the sample ID, so a longer real ID can
 * overhang the artwork even though the box did not. Measuring the real value
 * here keeps every glyph on the printable area.
 */
export function textAnchorOnCanvas(text: TextLayer, value: string, canvasWidth: number): number {
  const anchor = textAnchorX(text, value);
  const width = measureTextWidth(value, text.fontSize);

  if (text.alignment === "left") return clamp(anchor, 0, Math.max(0, canvasWidth - width));
  if (text.alignment === "right") return clamp(anchor, Math.min(width, canvasWidth), canvasWidth);
  return clamp(anchor, width / 2, canvasWidth - width / 2);
}

/** Left edge of the drawn text for a given alignment: `x` is always the box left. */
export function textAnchorX(text: TextLayer, value: string): number {
  const box = textBoxFor(text, value);
  if (text.alignment === "left") return text.x;
  if (text.alignment === "right") return text.x + box.width;
  return text.x + box.width / 2;
}

/**
 * A sensible starting overlay for a brand new template: a QR in the lower third
 * with its ID printed underneath, exactly where a shop would expect it.
 */
export function defaultOverlay(image: ImageBox): TemplateOverlay {
  const size = round(clamp(Math.min(image.width, image.height) * 0.34, MIN_QR_SIZE, Math.min(image.width, image.height)));
  const qr = clampQr({ x: Math.round((image.width - size) / 2), y: Math.round(image.height * 0.52), size }, image);

  return normalizeOverlay({ qr, text: defaultTextFor(qr, image, REFERENCE_ID) }, image, REFERENCE_ID);
}

/**
 * Default text placement for a QR: centred underneath it with a small gap, the
 * way the old combined block used to look. Used for new templates and to give
 * pre-overlay templates a sensible text layer.
 */
export function defaultTextFor(qr: QrLayer, image: ImageBox, value: string): TextLayer {
  const fontSize = round(clamp(qr.size * 0.12, MIN_TEXT_SIZE, maxFontSize(image, value, 0)));
  const box = textBoxFor({ x: 0, y: 0, fontSize, rotation: 0, alignment: "center" }, value);

  const gap = Math.round(qr.size * 0.06);
  const below = qr.y + qr.size + gap;

  return clampText(
    {
      x: qr.x + Math.round((qr.size - box.width) / 2),
      // Underneath when there is room, otherwise above: never on top of the code.
      y: below + box.height <= image.height ? below : qr.y - gap - box.height,
      fontSize,
      rotation: 0,
      alignment: "center",
    },
    image,
    value,
  );
}

/** Reads a stored template's overlay, upgrading pre-overlay documents on the fly. */
export function overlayFromStored(
  stored: { overlay?: TemplateOverlay | null; qrPosition?: LegacyPlacement | null },
  image: ImageBox,
  value: string,
): TemplateOverlay {
  if (stored.overlay?.qr && stored.overlay?.text) {
    return normalizeOverlay(stored.overlay, image, value);
  }

  if (stored.qrPosition) {
    const { x, y, width, height } = stored.qrPosition;
    const qr = clampQr({ x, y, size: Math.min(width, height) }, image);
    return normalizeOverlay({ qr, text: defaultTextFor(qr, image, value) }, image, value);
  }

  return defaultOverlay(image);
}

/** Legacy rectangle, derived from the QR layer, for anything still reading `qrPosition`. */
export function placementFromQr(qr: QrLayer): LegacyPlacement {
  return { x: qr.x, y: qr.y, width: qr.size, height: qr.size };
}
