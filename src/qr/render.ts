import QRCode from "qrcode";
import sharp from "sharp";
import { qrRedirectUrl } from "@/lib/env";
import type { QrDotStyle, QrIcon } from "@/qr/overlay";

/**
 * High error correction so the code survives printing on textured or glossy stock.
 */
export const QR_ERROR_CORRECTION = "Q" as const;

/**
 * The artwork's white QR plate provides the contrast around the symbol, so no
 * extra quiet-zone padding is added inside the configured square.
 */
export const QR_QUIET_ZONE_MODULES = 0;

const QR_OPTIONS = {
  type: "png" as const,
  errorCorrectionLevel: QR_ERROR_CORRECTION,
  margin: QR_QUIET_ZONE_MODULES,
};

export type RenderedQr = { buffer: Buffer; size: number };
export type QrAppearance = { dotStyle?: QrDotStyle; icon?: QrIcon };

/** URL encoded inside the printed code. It only ever points back at this app. */
export function qrPayload(qrId: string): string {
  return qrRedirectUrl(qrId);
}

/** Modules across for a given payload. */
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

function iconMarkup(icon: QrIcon | undefined): string {
  if (!icon || icon === "none") return "";
  if (typeof icon === "object" && icon.type === "custom") {
    return `<image href="${icon.dataUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" x="43" y="43" width="14" height="14" preserveAspectRatio="xMidYMid meet"/>`;
  }

  if (icon === "instagram") {
    return `<rect x="45" y="45" width="10" height="10" rx="3" fill="none" stroke="#d62976" stroke-width="1.5"/><circle cx="50" cy="50" r="2.1" fill="none" stroke="#d62976" stroke-width="1.5"/><circle cx="53.7" cy="46.4" r=".8" fill="#d62976"/>`;
  }
  if (icon === "google") return `<path d="M57 49.3h-7v2.4h4c-.3 1.2-1.4 2.5-4 2.5a4.2 4.2 0 1 1 2.7-7.4l1.9-1.8A6.8 6.8 0 1 0 50 57c4 0 6.7-2.8 6.7-6.8 0-.4 0-.7-.1-.9Z" fill="#4285f4"/>`;
  if (icon === "whatsapp") return `<path d="M50 43a7 7 0 0 0-6 10.5L42.8 57l3.7-1a7 7 0 1 0 3.5-13Zm0 12.2a5.2 5.2 0 0 1-2.7-.8l-.3-.2-2.2.6.6-2.1-.2-.3a5.2 5.2 0 1 1 4.8 2.8Zm2.8-3.8c-.2-.1-1.3-.6-1.5-.7-.2-.1-.3-.1-.5.1l-.6.7c-.1.2-.3.2-.5.1a5.3 5.3 0 0 1-1.6-1 5.8 5.8 0 0 1-1.1-1.4c-.1-.2 0-.3.1-.4l.3-.4c.1-.1.1-.2.2-.3.1-.1 0-.3 0-.4l-.7-1.5c-.2-.4-.4-.4-.5-.4h-.4c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.1.9 2.2c.1.1 1.6 2.4 3.8 3.4.5.2.9.3 1.2.4.5.1 1 .1 1.4.1.4-.1 1.3-.5 1.5-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.5-.3Z" fill="#25d366"/>`;
  return `<path d="M47 53a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-.8.8m4.5 5.2a4 4 0 0 0-5.7 0L45 53.3a4 4 0 0 0 5.7 5.7l.8-.8" fill="none" stroke="#111827" stroke-width="1.7" stroke-linecap="round"/>`;
}

function isFinderModule(row: number, col: number, size: number): boolean {
  return (row < 9 && col < 9) || (row < 9 && col >= size - 8) || (row >= size - 8 && col < 9);
}

async function renderRoundQr(text: string, scale: number, icon: QrIcon | undefined): Promise<Buffer> {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: QR_ERROR_CORRECTION });
  const grid = modules.size + QR_QUIET_ZONE_MODULES * 2;
  const dots: string[] = [];

  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (!modules.get(row, col)) continue;
      const x = col + QR_QUIET_ZONE_MODULES + 0.5;
      const y = row + QR_QUIET_ZONE_MODULES + 0.5;
      if (isFinderModule(row, col, modules.size)) {
        dots.push(`<rect x="${col + QR_QUIET_ZONE_MODULES}" y="${row + QR_QUIET_ZONE_MODULES}" width="1" height="1"/>`);
      } else {
        dots.push(`<circle cx="${x}" cy="${y}" r="0.38"/>`);
      }
    }
  }

  const iconScale = grid / 100;
  const iconLayer = icon && icon !== "none"
    ? `<rect x="${grid * 0.4}" y="${grid * 0.4}" width="${grid * 0.2}" height="${grid * 0.2}" rx="${grid * 0.035}" fill="white"/><g transform="scale(${iconScale})">${iconMarkup(icon)}</g>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${grid * scale}" height="${grid * scale}" viewBox="0 0 ${grid} ${grid}"><rect width="100%" height="100%" fill="white"/><g fill="black">${dots.join("")}</g>${iconLayer}</svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Renders a QR code at an exact scale, sized to fit `maxPixels`.
 *
 * Resizing a QR afterwards distorts module widths and makes symbols hard to read,
 * so the code is drawn at the scale computed here and centred by the caller.
 */
export async function renderQr(qrId: string, maxPixels: number, appearance: QrAppearance = {}): Promise<RenderedQr> {
  const text = qrPayload(qrId);
  const { modules } = QRCode.create(text, { errorCorrectionLevel: QR_ERROR_CORRECTION });

  // The rendered PNG covers exactly the QR modules.
  const grid = modules.size + QR_QUIET_ZONE_MODULES * 2;
  const pixelsPerModule = pixelsPerModuleFor(grid, maxPixels);

  const base = appearance.dotStyle === "round"
    ? await renderRoundQr(text, pixelsPerModule, appearance.icon)
    : await QRCode.toBuffer(text, { ...QR_OPTIONS, scale: pixelsPerModule });
  const buffer = appearance.dotStyle === "round" || !appearance.icon || appearance.icon === "none"
    ? base
    : await sharp(base)
        .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${grid * pixelsPerModule}" height="${grid * pixelsPerModule}" viewBox="0 0 100 100"><rect x="40" y="40" width="20" height="20" rx="3.5" fill="white"/>${iconMarkup(appearance.icon)}</svg>`) }])
        .png({ compressionLevel: 9 })
        .toBuffer();

  return {
    buffer,
    size: Math.min(maxPixels, grid * pixelsPerModule),
  };
}

/** Standalone QR PNG, used by the admin table and the design previews. */
export async function renderQrPng(qrId: string, maxPixels = 512): Promise<Buffer> {
  return (await renderQr(qrId, maxPixels)).buffer;
}
