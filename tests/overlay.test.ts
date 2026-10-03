import { describe, expect, it } from "vitest";
import {
  MIN_QR_SIZE,
  MIN_TEXT_SIZE,
  REFERENCE_ID,
  TEXT_ALIGNMENTS,
  clampQr,
  clampText,
  defaultOverlay,
  defaultTextFor,
  maxFontSize,
  moveQr,
  moveText,
  normalizeOverlay,
  normalizeRotation,
  overlayFromStored,
  placementFromQr,
  resizeQrFromCorner,
  resizeTextFromCorner,
  rotateText,
  rotatedExtent,
  textAnchorOnCanvas,
  textAnchorX,
  textBoxFor,
  textCentre,
  type LegacyPlacement,
  type TemplateOverlay,
} from "@/qr/overlay";
import { measureTextWidth, textBoxHeight } from "@/qr/text-metrics";

const IMAGE = { width: 1000, height: 800 };
const QR: TemplateOverlay["qr"] = { x: 300, y: 200, size: 240 };
const TEXT: TemplateOverlay["text"] = { x: 320, y: 470, fontSize: 24, rotation: 0, alignment: "center" };

const box = (text: TemplateOverlay["text"]) => textBoxFor(text, REFERENCE_ID);

/** A corner of the text box in world coordinates, which turns with the text. */
function worldCorner(text: TemplateOverlay["text"], value: string, corner: "nw" | "se") {
  const measured = textBoxFor(text, value);
  const radians = (text.rotation * Math.PI) / 180;
  const sign = corner === "se" ? 1 : -1;
  const localX = (sign * measured.width) / 2;
  const localY = (sign * measured.height) / 2;

  return {
    x: text.x + measured.width / 2 + localX * Math.cos(radians) - localY * Math.sin(radians),
    y: text.y + measured.height / 2 + localX * Math.sin(radians) + localY * Math.cos(radians),
  };
}

/** Rotated bounding box, computed here rather than trusting the module. */
function expectedExtent(text: TemplateOverlay["text"], value: string) {
  const measured = textBoxFor(text, value);
  const radians = (text.rotation * Math.PI) / 180;

  return {
    width: Math.abs(measured.width * Math.cos(radians)) + Math.abs(measured.height * Math.sin(radians)),
    height: Math.abs(measured.width * Math.sin(radians)) + Math.abs(measured.height * Math.cos(radians)),
  };
}

describe("text metrics", () => {
  it("scales linearly with the font size", () => {
    expect(measureTextWidth(REFERENCE_ID, 100)).toBe(measureTextWidth(REFERENCE_ID, 50) * 2);
    expect(textBoxHeight(30)).toBe(36);
  });

  it("widens as the ID gets longer", () => {
    expect(measureTextWidth("QR9KX72ABCD", 20)).toBeGreaterThan(measureTextWidth(REFERENCE_ID, 20));
  });

  it("boxes the text at the line height", () => {
    expect(box(TEXT)).toEqual({ width: Math.round(measureTextWidth(REFERENCE_ID, TEXT.fontSize)), height: textBoxHeight(TEXT.fontSize) });
  });
});

describe("clampQr", () => {
  it("keeps a square on the artwork", () => {
    expect(clampQr(QR, IMAGE)).toEqual(QR);
  });

  it("pulls a box back inside", () => {
    expect(clampQr({ x: 900, y: 700, size: 240 }, IMAGE)).toEqual({ x: 760, y: 560, size: 240 });
    expect(clampQr({ x: -50, y: -50, size: 240 }, IMAGE)).toEqual({ x: 0, y: 0, size: 240 });
  });

  it("caps the size at the artwork and never below the minimum", () => {
    expect(clampQr({ x: 0, y: 0, size: 5000 }, IMAGE).size).toBe(800);
    expect(clampQr({ x: 0, y: 0, size: 1 }, IMAGE).size).toBe(MIN_QR_SIZE);
  });

  it("never exceeds the artwork on a tiny one", () => {
    const tiny = { width: 40, height: 30 };
    const clamped = clampQr({ x: 0, y: 0, size: 400 }, tiny);

    expect(clamped.size).toBe(30);
    expect(clamped.x + clamped.size).toBeLessThanOrEqual(tiny.width);
  });
});

describe("clampText", () => {
  it("leaves a text that already fits alone", () => {
    expect(clampText(TEXT, IMAGE, REFERENCE_ID)).toEqual(TEXT);
  });

  it("keeps rotated text inside the artwork", () => {
    for (const rotation of [0, 15, 45, 90, 135, 180, -90]) {
      const text = { ...TEXT, rotation, x: 950, y: 780 };
      const clamped = clampText(text, IMAGE, REFERENCE_ID);
      const extent = rotatedExtent(clamped, REFERENCE_ID);
      const centre = { x: clamped.x + box(clamped).width / 2, y: clamped.y + box(clamped).height / 2 };

      expect(centre.x - extent.width / 2).toBeGreaterThanOrEqual(-0.5);
      expect(centre.y - extent.height / 2).toBeGreaterThanOrEqual(-0.5);
      expect(centre.x + extent.width / 2).toBeLessThanOrEqual(IMAGE.width + 0.5);
      expect(centre.y + extent.height / 2).toBeLessThanOrEqual(IMAGE.height + 0.5);
    }
  });

  it("keeps the font size inside its usable range", () => {
    expect(clampText({ ...TEXT, fontSize: 1 }, IMAGE, REFERENCE_ID).fontSize).toBe(MIN_TEXT_SIZE);
    expect(clampText({ ...TEXT, fontSize: 900 }, IMAGE, REFERENCE_ID).fontSize).toBe(Math.round(maxFontSize(IMAGE, REFERENCE_ID, 0)));
  });

  it("falls back to a known alignment", () => {
    expect(clampText({ ...TEXT, alignment: "middle" as never }, IMAGE, REFERENCE_ID).alignment).toBe("center");
    for (const alignment of TEXT_ALIGNMENTS) {
      expect(clampText({ ...TEXT, alignment }, IMAGE, REFERENCE_ID).alignment).toBe(alignment);
    }
  });

  it("wraps the rotation into one turn", () => {
    expect(normalizeRotation(370)).toBe(10);
    expect(normalizeRotation(-370)).toBe(-10);
    expect(normalizeRotation(720)).toBe(0);
  });
});

describe("moving", () => {
  it("moves the QR by a delta", () => {
    expect(moveQr(QR, IMAGE, 100, -50)).toEqual({ x: 400, y: 150, size: 240 });
    expect(moveQr(QR, IMAGE, -1000, -1000)).toEqual({ x: 0, y: 0, size: 240 });
  });

  it("moves the text by a delta and leaves its rotation alone", () => {
    const text = { ...TEXT, rotation: 25 };

    expect(moveText(text, IMAGE, REFERENCE_ID, 100, 20)).toMatchObject({ rotation: 25 });
    expect(moveText(text, IMAGE, REFERENCE_ID, -1000, -1000)).toMatchObject({ rotation: 25 });
  });
});

describe("resizing the QR from a corner", () => {
  const corners = ["nw", "ne", "sw", "se"] as const;

  it("always returns a square", () => {
    for (const corner of corners) {
      const resized = resizeQrFromCorner(QR, IMAGE, corner, { x: 120, y: 90 });
      expect(Object.keys(resized).sort()).toEqual(["size", "x", "y"]);
      expect(resized.size).toBeGreaterThanOrEqual(MIN_QR_SIZE);
    }
  });

  it("pins the opposite corner", () => {
    for (const corner of corners) {
      const resized = resizeQrFromCorner(QR, IMAGE, corner, { x: 640, y: 560 });

      const opposite = { nw: "se", ne: "sw", sw: "ne", se: "nw" }[corner] as "nw" | "ne" | "sw" | "se";
      const before = { nw: { x: QR.x, y: QR.y }, ne: { x: QR.x + QR.size, y: QR.y }, sw: { x: QR.x, y: QR.y + QR.size }, se: { x: QR.x + QR.size, y: QR.y + QR.size } }[opposite];
      const after = { nw: { x: resized.x, y: resized.y }, ne: { x: resized.x + resized.size, y: resized.y }, sw: { x: resized.x, y: resized.y + resized.size }, se: { x: resized.x + resized.size, y: resized.y + resized.size } }[opposite];

      expect(after).toEqual(before);
    }
  });

  it("follows the axis the pointer moved furthest on", () => {
    // Wide and short drag: the width wins.
    expect(resizeQrFromCorner(QR, IMAGE, "se", { x: 840, y: 420 }).size).toBe(540);
    // Tall and narrow drag: the height wins.
    expect(resizeQrFromCorner(QR, IMAGE, "se", { x: 620, y: 700 }).size).toBe(500);
  });

  it("keeps the pinned corner when the pointer is dragged past it", () => {
    const resized = resizeQrFromCorner(QR, IMAGE, "nw", { x: QR.x + QR.size + 400, y: QR.y + QR.size + 400 });

    expect(resized.x + resized.size).toBe(QR.x + QR.size);
    expect(resized.y + resized.size).toBe(QR.y + QR.size);
  });

  it("stays on the artwork", () => {
    for (const corner of corners) {
      const resized = resizeQrFromCorner(QR, IMAGE, corner, { x: -4000, y: -4000 });

      expect(resized.x).toBeGreaterThanOrEqual(0);
      expect(resized.y).toBeGreaterThanOrEqual(0);
      expect(resized.x + resized.size).toBeLessThanOrEqual(IMAGE.width);
      expect(resized.y + resized.size).toBeLessThanOrEqual(IMAGE.height);
    }
  });
});

describe("resizing the text from a corner", () => {
  it("scales the font and pins the opposite corner", () => {
    const before = box(TEXT);
    const opposite = { x: TEXT.x + before.width, y: TEXT.y + before.height };

    const resized = resizeTextFromCorner(TEXT, IMAGE, REFERENCE_ID, "nw", { x: TEXT.x - 45, y: TEXT.y - 8 });
    const after = box(resized);

    expect(resized.fontSize).toBeGreaterThan(TEXT.fontSize);
    expect(resized.x + after.width).toBeCloseTo(opposite.x, 5);
    expect(resized.y + after.height).toBeCloseTo(opposite.y, 5);
  });

  it("scales down towards the minimum", () => {
    // Collapse the north-west corner onto the centre.
    const large = { ...TEXT, fontSize: 60 };
    const centre = textCentre(large, REFERENCE_ID);
    const resized = resizeTextFromCorner(large, IMAGE, REFERENCE_ID, "nw", { x: centre.x + 1, y: centre.y + 1 });

    expect(resized.fontSize).toBe(MIN_TEXT_SIZE);
  });

  it("works the same while the text is rotated", () => {
    const rotated = { ...TEXT, rotation: 30 };
    const opposite = worldCorner(rotated, REFERENCE_ID, "se");

    const resized = resizeTextFromCorner(rotated, IMAGE, REFERENCE_ID, "nw", { x: rotated.x - 60, y: rotated.y - 15 });

    // Layers are stored as whole pixels, so the pin survives to the pixel.
    const after = worldCorner(resized, REFERENCE_ID, "se");

    expect(resized.rotation).toBe(30);
    expect(Math.abs(after.x - opposite.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - opposite.y)).toBeLessThanOrEqual(1);
  });

  it("never leaves the artwork", () => {
    for (const rotation of [0, 45, 90, 180]) {
      const resized = resizeTextFromCorner({ ...TEXT, rotation, x: 950, y: 760 }, IMAGE, REFERENCE_ID, "ne", { x: 5000, y: 5000 });
      const extent = rotatedExtent(resized, REFERENCE_ID);
      const centre = { x: resized.x + box(resized).width / 2, y: resized.y + box(resized).height / 2 };

      expect(centre.x + extent.width / 2).toBeLessThanOrEqual(IMAGE.width + 0.5);
      expect(centre.y + extent.height / 2).toBeLessThanOrEqual(IMAGE.height + 0.5);
    }
  });
});

describe("rotating", () => {
  it("turns around the centre", () => {
    const before = box(TEXT);
    const centre = { x: TEXT.x + before.width / 2, y: TEXT.y + before.height / 2 };

    const turned = rotateText(TEXT, IMAGE, REFERENCE_ID, 90);
    const after = box(turned);

    expect(turned.rotation).toBe(90);
    expect(turned.x + after.width / 2).toBeCloseTo(centre.x, 5);
    expect(turned.y + after.height / 2).toBeCloseTo(centre.y, 5);
  });

  it("swaps the bounds at a quarter turn", () => {
    const flat = rotatedExtent({ ...TEXT, rotation: 0 }, REFERENCE_ID);
    const turned = rotatedExtent({ ...TEXT, rotation: 90 }, REFERENCE_ID);

    expect(Math.round(turned.height)).toBe(Math.round(flat.width));
    expect(Math.round(turned.width)).toBe(Math.round(flat.height));
  });

  it("can be given an explicit pivot", () => {
    const turned = rotateText(TEXT, IMAGE, REFERENCE_ID, 180, { x: 900, y: 700 });

    // Integer pixels: the pivot may only survive to the nearest whole pixel.
    expect(Math.abs(turned.x + box(turned).width / 2 - 900)).toBeLessThanOrEqual(1);
    expect(Math.abs(turned.y + box(turned).height / 2 - 700)).toBeLessThanOrEqual(1);
  });
});

describe("text anchors", () => {
  it("moves the anchor inside the box for each alignment", () => {
    const measured = box(TEXT);

    expect(textAnchorX({ ...TEXT, alignment: "left" }, REFERENCE_ID)).toBe(TEXT.x);
    expect(textAnchorX({ ...TEXT, alignment: "center" }, REFERENCE_ID)).toBe(TEXT.x + measured.width / 2);
    expect(textAnchorX({ ...TEXT, alignment: "right" }, REFERENCE_ID)).toBe(TEXT.x + measured.width);
  });

  it("keeps the real value on the canvas when it is wider than the box", () => {
    const long = "QR9KX72ABCDQRP4";
    const width = measureTextWidth(long, TEXT.fontSize);
    const text = { ...TEXT, x: IMAGE.width - 4 };

    for (const alignment of TEXT_ALIGNMENTS) {
      const anchor = textAnchorOnCanvas({ ...text, alignment }, long, IMAGE.width);

      expect(anchor - (alignment === "right" ? width : alignment === "center" ? width / 2 : 0)).toBeGreaterThanOrEqual(-0.5);
      expect(anchor + (alignment === "left" ? width : alignment === "center" ? width / 2 : 0)).toBeLessThanOrEqual(IMAGE.width + 0.5);
    }
  });
});

describe("defaults", () => {
  it("centres a new overlay on the artwork", () => {
    const overlay = defaultOverlay(IMAGE);
    const measured = box(overlay.text);

    expect(overlay.qr.x + overlay.qr.size / 2).toBe(IMAGE.width / 2);
    expect(overlay.text.x + measured.width / 2).toBeCloseTo(overlay.qr.x + overlay.qr.size / 2, 5);
    expect(overlay.text.rotation).toBe(0);
    expect(overlay.text.alignment).toBe("center");
  });

  it("puts the ID under the code when there is room", () => {
    const qr = { x: 100, y: 100, size: 200 };
    const text = defaultTextFor(qr, IMAGE, REFERENCE_ID);

    expect(text.y).toBeGreaterThan(qr.y + qr.size);
    expect(text.x).toBeGreaterThanOrEqual(0);
  });

  it("puts the ID above the code when there is no room below", () => {
    const qr = { x: 100, y: 600, size: 200 };
    const text = defaultTextFor(qr, IMAGE, REFERENCE_ID);

    expect(text.y + box(text).height).toBeLessThanOrEqual(qr.y);
    expect(text.y).toBeGreaterThanOrEqual(0);
  });

  it("never lands on top of the code", () => {
    for (let y = 0; y <= IMAGE.height - 64; y += 17) {
      const qr = clampQr({ x: 200, y, size: 200 }, IMAGE);
      const text = defaultTextFor(qr, IMAGE, REFERENCE_ID);
      const measured = box(text);

      expect(text.y + measured.height <= qr.y || text.y >= qr.y + qr.size).toBe(true);
    }
  });
});

describe("reading stored templates", () => {
  const legacy: LegacyPlacement = { x: 120, y: 300, width: 200, height: 240 };

  it("uses the overlay when there is one", () => {
    const overlay: TemplateOverlay = { qr: QR, text: { ...TEXT, rotation: 20 } };

    expect(overlayFromStored({ overlay, qrPosition: legacy }, IMAGE, REFERENCE_ID)).toEqual(overlay);
  });

  it("upgrades a legacy rectangle, keeping the square and adding text below", () => {
    const resolved = overlayFromStored({ qrPosition: legacy }, IMAGE, REFERENCE_ID);

    expect(resolved.qr).toEqual({ x: 120, y: 300, size: 200 });
    expect(resolved.text.y).toBeGreaterThanOrEqual(500);
    expect(resolved.text.rotation).toBe(0);
  });

  it("ignores a legacy rectangle that is present but empty", () => {
    expect(overlayFromStored({ overlay: null, qrPosition: null }, IMAGE, REFERENCE_ID).qr.size).toBeGreaterThan(0);
  });

  it("falls back to a centred overlay for a document with neither", () => {
    const resolved = overlayFromStored({}, IMAGE, REFERENCE_ID);

    expect(resolved).toEqual(defaultOverlay(IMAGE));
  });

  it("clamps whatever it reads", () => {
    const resolved = overlayFromStored(
      { overlay: { qr: { x: 5000, y: 5000, size: 4000 }, text: { x: 9000, y: 9000, fontSize: 400, rotation: 33, alignment: "center" } } },
      IMAGE,
      REFERENCE_ID,
    );

    expect(resolved.qr.x + resolved.qr.size).toBeLessThanOrEqual(IMAGE.width);
    expect(resolved.text.x).toBeLessThan(IMAGE.width);
  });

  it("round-trips back to the legacy rectangle", () => {
    expect(placementFromQr(QR)).toEqual({ x: QR.x, y: QR.y, width: QR.size, height: QR.size });
  });
});

describe("normalizeOverlay", () => {
  it("never throws and always returns something usable", () => {
    const messy = { qr: { x: Number.NaN, y: -900, size: Number.NaN }, text: { x: 4000, y: 4000, fontSize: Number.NaN, rotation: 900, alignment: "nope" as never } };
    const normalized = normalizeOverlay(messy, IMAGE, REFERENCE_ID);

    expect(Number.isFinite(normalized.qr.x)).toBe(true);
    expect(Number.isFinite(normalized.text.fontSize)).toBe(true);
    expect(normalized.text.alignment).toBe("center");
    expect(normalized.text.rotation).toBeGreaterThanOrEqual(-180);
  });

  it("matches what the renderer will measure for the rotated bounds", () => {
    const text = { ...TEXT, rotation: 33 };

    expect(rotatedExtent(text, REFERENCE_ID)).toEqual(expectedExtent(text, REFERENCE_ID));
  });
});
