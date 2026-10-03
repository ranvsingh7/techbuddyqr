import QRCode from "qrcode";
import { qrRedirectUrl } from "@/lib/env";

/**
 * High error correction so the code survives printing on textured or glossy stock,
 * and the four-module quiet zone the QR specification requires.
 */
export const QR_ERROR_CORRECTION = "Q" as const;

/**
 * Quiet zone in modules. Four is the minimum the QR specification allows and the
 * smallest that still scans reliably from a phone camera, so the QR fills its box
 * instead of floating inside a large white canvas.
 */
export const QR_QUIET_ZONE_MODULES = 4;

const QR_OPTIONS = {
  type: "png" as const,
  errorCorrectionLevel: QR_ERROR_CORRECTION,
  margin: QR_QUIET_ZONE_MODULES,
};

export type RenderedQr = { buffer: Buffer; size: number };

/** URL encoded inside the printed code. It only ever points back at this app. */
export function qrPayload(qrId: string): string {
  return qrRedirectUrl(qrId);
}

/** Modules across, quiet zone included, for a given payload. */
function moduleGrid(payload: string): number {
  return QRCode.create(payload, { errorCorrectionLevel: QR_ERROR_CORRECTION }).modules.size + QR_QUIET_ZONE_MODULES * 2;
}

/**
 * Pixels per module for a QR that has to fit inside `maxPixels`.
 *
 * Whole pixels per module are what keep a symbol scannable, so that is the
 * normal case and the symbol is centred in whatever slack is left over. Below two
 * pixels per module the box is too small for a crisp code, and the only way to
 * honour the placement the admin chose is to scale to fit exactly.
 */
function pixelsPerModuleFor(grid: number, maxPixels: number): number {
  const whole = Math.floor(maxPixels / grid);
  return whole >= 2 ? whole : maxPixels / grid;
}

/** The exact pixel size a QR bitmap will occupy inside a `maxPixels` box. Never larger than the box. */
export function printedQrSize(qrId: string, maxPixels: number): number {
  const grid = moduleGrid(qrPayload(qrId));
  return grid * pixelsPerModuleFor(grid, maxPixels);
}

/**
 * Renders a QR code at an exact scale, sized to fit `maxPixels`.
 *
 * Resizing a QR afterwards distorts module widths and makes symbols hard to read,
 * so the code is drawn at the scale computed here and centred by the caller.
 */
export async function renderQr(qrId: string, maxPixels: number): Promise<RenderedQr> {
  const text = qrPayload(qrId);
  const { modules } = QRCode.create(text, { errorCorrectionLevel: QR_ERROR_CORRECTION });

  // The rendered PNG covers the modules plus the quiet zone on all four sides.
  const grid = modules.size + QR_QUIET_ZONE_MODULES * 2;
  const pixelsPerModule = pixelsPerModuleFor(grid, maxPixels);

  return {
    buffer: await QRCode.toBuffer(text, { ...QR_OPTIONS, scale: pixelsPerModule }),
    size: Math.min(maxPixels, grid * pixelsPerModule),
  };
}

/** Standalone QR PNG, used by the admin table and the design previews. */
export async function renderQrPng(qrId: string, maxPixels = 512): Promise<Buffer> {
  return (await renderQr(qrId, maxPixels)).buffer;
}
