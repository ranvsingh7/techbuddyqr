import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderDesign } from "@/image/compose";
import { printedQrSize, renderQrPng } from "@/qr/render";
import { REFERENCE_ID, clampQr, rotatedExtent, textBoxFor, type TemplateOverlay } from "@/qr/overlay";
import { decodeQrText } from "./helpers/decode-qr";

const BASE_SIZE = { width: 1080, height: 1350 };
const IMAGE = { width: BASE_SIZE.width, height: BASE_SIZE.height };
const QR_ID = "QRA7K29X4P";
const EXPECTED_PAYLOAD = `${process.env.NEXT_PUBLIC_APP_URL}/q/${QR_ID}`;

const OVERLAYS: TemplateOverlay[] = [
  { qr: { x: 290, y: 800, size: 500 }, text: { x: 400, y: 1300, fontSize: 22, rotation: 0, alignment: "center" } },
  { qr: { x: 340, y: 100, size: 400 }, text: { x: 60, y: 560, fontSize: 28, rotation: -18, alignment: "left" } },
  { qr: { x: 0, y: 0, size: 260 }, text: { x: 700, y: 130, fontSize: 18, rotation: 90, alignment: "right" } },
  { qr: { x: 100, y: 600, size: 640 }, text: { x: 120, y: 200, fontSize: 34, rotation: 45, alignment: "center" } },
  { qr: { x: 20, y: 1250, size: 90 }, text: { x: 200, y: 1300, fontSize: 12, rotation: 0, alignment: "center" } },
];

const baseImage = () => sharp({ create: { ...BASE_SIZE, channels: 3, background: "#1f2937" } }).png().toBuffer();

/** Ink-inspection tests need a pale artwork, or the artwork itself reads as ink. */
const lightBaseImage = () => sharp({ create: { ...BASE_SIZE, channels: 3, background: "#ffffff" } }).png().toBuffer();

const scale = (value: number, factor: number) => Math.round(value * factor);

/** Dark pixel extent inside a region, used to compare the print against the model. */
async function darkBox(png: Buffer, region: { left: number; top: number; width: number; height: number }, threshold = 90) {
  const { data, info } = await sharp(png)
    .extract(region)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  let count = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x]! >= threshold) continue;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;
  return { left: region.left + minX, top: region.top + minY, right: region.left + maxX, bottom: region.top + maxY, count };
}

describe("renderDesign layers", () => {
  it("keeps the base artwork at its original size", async () => {
    const output = await renderDesign({ baseImage: await baseImage(), overlay: OVERLAYS[0]!, qrId: QR_ID });

    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(BASE_SIZE.width);
    expect(metadata.height).toBe(BASE_SIZE.height);
  });

  it("prints the QR square and the ID text at their own coordinates", async () => {
    const overlay = OVERLAYS[0]!;
    const output = await renderDesign({ baseImage: await lightBaseImage(), overlay, qrId: QR_ID });
    const text = textBoxFor(overlay.text, QR_ID);

    const qrBox = await darkBox(output, { left: overlay.qr.x, top: overlay.qr.y, width: overlay.qr.size, height: overlay.qr.size });

    expect(qrBox).not.toBeNull();
    // The code fills its square: within a pixel of each configured edge.
    expect(qrBox!.left).toBeGreaterThanOrEqual(overlay.qr.x - 1);
    expect(qrBox!.top).toBeGreaterThanOrEqual(overlay.qr.y - 1);
    expect(qrBox!.right).toBeLessThanOrEqual(overlay.qr.x + overlay.qr.size);
    expect(qrBox!.bottom).toBeLessThanOrEqual(overlay.qr.y + overlay.qr.size);
    // Whole-pixel modules leave at most a module of slack on each side.
    expect(qrBox!.right - qrBox!.left).toBeGreaterThan(overlay.qr.size * 0.7);

    // The ID sits inside its own box, which is nowhere near the QR square.
    const textInk = await darkBox(output, {
      left: overlay.text.x - 4,
      top: overlay.text.y - 4,
      width: text.width + 8,
      height: text.height + 8,
    });

    expect(textInk).not.toBeNull();
    expect(textInk!.count).toBeGreaterThan(100);
    expect(textInk!.left).toBeGreaterThanOrEqual(overlay.text.x - 1);
    expect(textInk!.right).toBeLessThanOrEqual(overlay.text.x + text.width + 1);
    expect(textInk!.top).toBeGreaterThanOrEqual(overlay.text.y - 1);
    expect(textInk!.bottom).toBeLessThanOrEqual(overlay.text.y + text.height + 1);
  });

  it("prints rotated text inside its rotated bounds", async () => {
    const overlay: TemplateOverlay = {
      qr: { x: 700, y: 1000, size: 300 },
      text: { x: 120, y: 300, fontSize: 30, rotation: 45, alignment: "center" },
    };
    const base = await lightBaseImage();
    const output = await renderDesign({ baseImage: base, overlay, qrId: QR_ID });

    const box = textBoxFor(overlay.text, QR_ID);
    const extent = rotatedExtent(overlay.text, QR_ID);
    const centre = { x: overlay.text.x + box.width / 2, y: overlay.text.y + box.height / 2 };

    // Search the whole rotated bounds: a turned glyph run leaves the flat box.
    const ink = await darkBox(output, {
      left: Math.floor(centre.x - extent.width / 2) - 4,
      top: Math.floor(centre.y - extent.height / 2) - 4,
      width: Math.ceil(extent.width) + 8,
      height: Math.ceil(extent.height) + 8,
    });

    expect(ink).not.toBeNull();
    expect(ink!.count).toBeGreaterThan(100);

    // The glyph run fits inside the rotated bounds the editor reserved for it.
    expect(ink!.left).toBeGreaterThanOrEqual(centre.x - extent.width / 2 - 1);
    expect(ink!.right).toBeLessThanOrEqual(centre.x + extent.width / 2 + 1);
    expect(ink!.top).toBeGreaterThanOrEqual(centre.y - extent.height / 2 - 1);
    expect(ink!.bottom).toBeLessThanOrEqual(centre.y + extent.height / 2 + 1);

    // Rotation genuinely turns the run: flat is wide and short, a quarter turn is tall and narrow.
    const measure = async (rotation: number) => {
      const turned: TemplateOverlay = { ...overlay, text: { ...overlay.text, rotation } };
      const turnedExtent = rotatedExtent(turned.text, QR_ID);
      const png = await renderDesign({ baseImage: base, overlay: turned, qrId: QR_ID });
      return darkBox(png, {
        left: Math.floor(centre.x - turnedExtent.width / 2) - 4,
        top: Math.floor(centre.y - turnedExtent.height / 2) - 4,
        width: Math.ceil(turnedExtent.width) + 8,
        height: Math.ceil(turnedExtent.height) + 8,
      });
    };

    const flat = await measure(0);
    const upright = await measure(90);

    expect(flat!.right - flat!.left).toBeGreaterThan(flat!.bottom - flat!.top);
    expect(upright!.bottom - upright!.top).toBeGreaterThan(upright!.right - upright!.left);
    expect(Math.abs(flat!.right - flat!.left - upright!.bottom + upright!.top)).toBeLessThan(12);
  });

  it("honours text alignment", async () => {
    const base = await lightBaseImage();
    const overlay = { qr: { x: 0, y: 0, size: 120 }, text: { x: 400, y: 600, fontSize: 26, rotation: 0, alignment: "center" as const } };
    const box = textBoxFor(overlay.text, QR_ID);
    const inkWidths: number[] = [];

    for (const alignment of ["left", "center", "right"] as const) {
      const placed: TemplateOverlay = { ...overlay, text: { ...overlay.text, alignment } };
      const output = await renderDesign({ baseImage: base, overlay: placed, qrId: QR_ID });
      const ink = await darkBox(output, {
        left: overlay.text.x - 6,
        top: overlay.text.y - 6,
        width: box.width + 12,
        height: box.height + 12,
      });

      const width = ink!.right - ink!.left;
      inkWidths.push(width);

      // Same box every time; only the anchor moves the run inside it.
      const expectedLeft =
        alignment === "left" ? overlay.text.x : alignment === "center" ? overlay.text.x + (box.width - width) / 2 : overlay.text.x + box.width - width;

      expect(Math.abs(ink!.left - expectedLeft)).toBeLessThanOrEqual(2);
      expect(ink!.right).toBeLessThanOrEqual(overlay.text.x + box.width + 1);
      expect(ink!.left).toBeGreaterThanOrEqual(overlay.text.x - 1);
    }

    // The glyph run itself never changed size.
    expect(Math.max(...inkWidths) - Math.min(...inkWidths)).toBeLessThanOrEqual(2);
  });

  it("clamps layers that would fall off the artwork instead of clipping them", async () => {
    const overlay: TemplateOverlay = {
      qr: { x: 5000, y: -400, size: 900 },
      text: { x: 4000, y: 9000, fontSize: 120, rotation: 33, alignment: "center" },
    };

    const output = await renderDesign({ baseImage: await lightBaseImage(), overlay, qrId: QR_ID });
    const qr = clampQr(overlay.qr, IMAGE);
    const ink = await darkBox(output, { left: 0, top: 0, width: IMAGE.width, height: IMAGE.height });

    expect(ink).not.toBeNull();
    expect(ink!.left).toBeGreaterThanOrEqual(qr.x);
    expect(ink!.right).toBeLessThanOrEqual(qr.x + qr.size);
    expect(ink!.bottom).toBeLessThanOrEqual(IMAGE.height);
  });

  it("renders a readable QR for every overlay", async () => {
    const base = await baseImage();

    for (const overlay of OVERLAYS) {
      const output = await renderDesign({ baseImage: base, overlay, qrId: QR_ID });
      const region = { left: overlay.qr.x, top: overlay.qr.y, width: overlay.qr.size, height: overlay.qr.size };

      expect(await decodeQrText(output, region)).toBe(EXPECTED_PAYLOAD);
    }
  });

  it("survives resampling to a printed card", async () => {
    // A 4x5in card at 300dpi, JPEG compressed, on artwork dark enough to matter.
    const base = await baseImage();

    for (const overlay of OVERLAYS.filter((candidate) => candidate.qr.size >= 200)) {
      const output = await renderDesign({ baseImage: base, overlay, qrId: QR_ID });
      const printed = await sharp(output).resize(1200, 1500).jpeg({ quality: 72 }).toBuffer();
      // A few pixels of slack absorb the resample's coordinate rounding.
      const printedRegion = {
        left: Math.max(0, scale(overlay.qr.x, 1200 / BASE_SIZE.width) - 8),
        top: Math.max(0, scale(overlay.qr.y, 1500 / BASE_SIZE.height) - 8),
        width: scale(overlay.qr.size, 1200 / BASE_SIZE.width) + 16,
        height: scale(overlay.qr.size, 1500 / BASE_SIZE.height) + 16,
      };

      expect(await decodeQrText(printed, printedRegion)).toBe(EXPECTED_PAYLOAD);
    }
  });

  it("gives each QR code a different payload at the same overlay", async () => {
    const base = await baseImage();
    const overlay = OVERLAYS[0]!;
    const region = { left: overlay.qr.x, top: overlay.qr.y, width: overlay.qr.size, height: overlay.qr.size };

    for (const qrId of ["QRA7K29X4P", "QR82M4P1AB", "QR9KX72ABCD"]) {
      const output = await renderDesign({ baseImage: base, overlay, qrId });
      expect(await decodeQrText(output, region)).toBe(`${process.env.NEXT_PUBLIC_APP_URL}/q/${qrId}`);
    }
  });

  it("plates the QR square only, leaving the ID text unplated", async () => {
    const overlay: TemplateOverlay = {
      qr: { x: 300, y: 400, size: 400 },
      text: { x: 320, y: 900, fontSize: 30, rotation: 0, alignment: "center" },
    };

    const plated = await renderDesign({ baseImage: await baseImage(), overlay, qrId: QR_ID, lightPlate: true });
    const bare = await renderDesign({ baseImage: await baseImage(), overlay, qrId: QR_ID, lightPlate: false });
    const box = textBoxFor(overlay.text, QR_ID);
    const region = { left: overlay.text.x - 6, top: overlay.text.y - 6, width: box.width + 12, height: box.height + 12 };

    // Identical ink means the plate left the text alone.
    const withPlate = await darkBox(plated, region, 250);
    const withoutPlate = await darkBox(bare, region, 250);
    expect(withPlate!.count).toBe(withoutPlate!.count);

    const { data, info } = await sharp(plated).greyscale().raw().toBuffer({ resolveWithObject: true });
    const { data: bareData, info: bareInfo } = await sharp(bare).greyscale().raw().toBuffer({ resolveWithObject: true });
    const at = (buffer: Uint8Array, width: number, x: number, y: number) => buffer[y * width + x]!;

    // Inside the square but outside the symbol, where the whole-module scale left
    // slack: white with the plate, bare artwork without.
    const slack = Math.floor((overlay.qr.size - printedQrSize(QR_ID, overlay.qr.size)) / 2);
    expect(slack).toBeGreaterThan(4);
    const inside = { x: overlay.qr.x + 2, y: overlay.qr.y + overlay.qr.size / 2 };
    expect(at(data, info.width, inside.x, inside.y)).toBeGreaterThan(240);
    expect(at(bareData, bareInfo.width, inside.x, inside.y)).toBeLessThan(80);

    // Past the square, the plate stops: same pixels either way.
    const outside = { x: overlay.qr.x + overlay.qr.size + 30, y: overlay.qr.y + overlay.qr.size / 2 };
    expect(at(data, info.width, outside.x, outside.y)).toBe(at(bareData, bareInfo.width, outside.x, outside.y));
  });

  it("is deterministic", async () => {
    const base = await baseImage();
    const overlay = OVERLAYS[1]!;

    const first = await renderDesign({ baseImage: base, overlay, qrId: QR_ID });
    const second = await renderDesign({ baseImage: base, overlay, qrId: QR_ID });

    expect(first.equals(second)).toBe(true);
  });
});

describe("text metrics shared with the editor", () => {
  it("sizes the text box from the same tables the renderer uses", () => {
    const text = { x: 100, y: 200, fontSize: 24, rotation: 0, alignment: "center" as const };
    const box = textBoxFor(text, REFERENCE_ID);

    expect(box.width).toBe(Math.round(box.width));
    // 8 characters of Helvetica Bold is about 5.3em.
    expect(box.width).toBeGreaterThan(120);
    expect(box.width).toBeLessThan(135);
    expect(box.height).toBe(Math.round(24 * 1.2));

    // A longer ID gets a wider box, at the same font size.
    expect(textBoxFor(text, "QR9KX72ABCD").width).toBeGreaterThan(box.width);
  });
});

describe("printedQrSize", () => {
  it("never grows past the configured square, however small it is", () => {
    for (const size of [64, 70, 74, 90, 111, 150, 260, 500, 640, 1000]) {
      expect(printedQrSize(QR_ID, size)).toBeLessThanOrEqual(size);
    }
  });

  it("is the largest whole-module symbol that fits", () => {
    // 37 modules across for this payload, so whole scales land on multiples of 37.
    expect(printedQrSize(QR_ID, 500)).toBe(481);
    expect(printedQrSize(QR_ID, 481)).toBe(481);
    expect(printedQrSize(QR_ID, 480)).toBe(444);
    expect(printedQrSize(QR_ID, 90)).toBe(74);
  });
});

describe("renderQrPng", () => {
  it("renders a square symbol with the required quiet zone", async () => {
    const png = await renderQrPng(QR_ID);
    const metadata = await sharp(png).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(metadata.height);

    const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    const corner = (x: number, y: number) => data[y * info.width + x]!;
    const corners = [
      corner(0, 0),
      corner(info.width - 1, 0),
      corner(0, info.height - 1),
      corner(info.width - 1, info.height - 1),
    ];

    for (const value of corners) expect(value).toBeGreaterThan(240);
  });

  it("encodes only the app URL, never the shop destination", async () => {
    expect(await decodeQrText(await renderQrPng(QR_ID))).toBe(EXPECTED_PAYLOAD);
  });
});
