import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import JSZip from "jszip";
import { SignJWT } from "jose";
import { connectTestDatabase, disconnectTestDatabase, resetTestDatabase } from "./helpers/database";
import { storage } from "@/lib/storage";
import { requestWithIp } from "./helpers/request-scope";
import { decodeQrText } from "./helpers/decode-qr";
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "@/auth/session";
import { generateQrCodes } from "@/services/qr";
import { Template } from "@/models/Template";
import {
  REFERENCE_ID,
  defaultOverlay,
  moveQr,
  moveText,
  placementFromQr,
  resizeQrFromCorner,
  resizeTextFromCorner,
  rotateText,
  textBoxFor,
  type LegacyPlacement,
  type TemplateOverlay,
} from "@/qr/overlay";
import { printedQrSize, renderQr } from "@/qr/render";
import { POST as createTemplateRoute } from "@/app/api/admin/templates/route";
import { GET as readTemplateRoute, PATCH as patchTemplateRoute } from "@/app/api/admin/templates/[id]/route";
import { GET as designRoute } from "@/app/api/admin/qr/[qrId]/design/route";
import { POST as downloadRoute } from "@/app/api/admin/designs/download/route";

/**
 * What an admin drags in the browser has to come out as the same pixels in the
 * printed PNG. These tests walk the whole path: editor maths -> upload -> save ->
 * reopen -> print -> decode -> ZIP, for both layers independently.
 */

const cookies = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookies.has(name) ? { name, value: cookies.get(name) } : undefined),
    set: (name: string, value: string) => void cookies.set(name, value),
    delete: (name: string) => void cookies.delete(name),
  }),
}));

const ARTWORK = { width: 400, height: 600 };
const PAPER = "#e8e4dc";

const signIn = async () => {
  const token = await new SignJWT({ email: env().adminEmail })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(env().authSecret));
  cookies.set(SESSION_COOKIE, token);
};

const authed = (url: string, init?: RequestInit) => requestWithIp("10.0.0.1", url, init);

const json = (payload: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});

const artwork = () => sharp({ create: { ...ARTWORK, channels: 3, background: PAPER } }).png().toBuffer();

/** Exactly what the editor produces: a default, then drags and corner resizes on each layer. */
function editLikeTheEditor(): TemplateOverlay {
  const suggested = defaultOverlay(ARTWORK);

  const draggedQr = moveQr(moveQr(suggested.qr, ARTWORK, -140, -120), ARTWORK, -4, -6);
  const resizedQr = resizeQrFromCorner(draggedQr, ARTWORK, "nw", { x: 18, y: 96 });

  const draggedText = moveText(suggested.text, ARTWORK, REFERENCE_ID, -150, -40);
  const resizedText = resizeTextFromCorner(draggedText, ARTWORK, REFERENCE_ID, "se", { x: 300, y: 470 });
  const turnedText = rotateText(resizedText, ARTWORK, REFERENCE_ID, -12);

  return { qr: resizedQr, text: turnedText };
}

type StoredTemplate = {
  _id: string;
  overlay: TemplateOverlay;
  qrPosition: LegacyPlacement;
  imageWidth: number;
  imageHeight: number;
  lightPlate: boolean;
};

async function uploadTemplate(overlay: TemplateOverlay) {
  const form = new FormData();
  form.set("image", new File([await artwork()], "card.png", { type: "image/png" }));
  form.set("name", "Table card");
  form.set("type", "WHATSAPP");
  form.set("lightPlate", "true");
  form.set("qr.x", String(overlay.qr.x));
  form.set("qr.y", String(overlay.qr.y));
  form.set("qr.size", String(overlay.qr.size));
  form.set("text.x", String(overlay.text.x));
  form.set("text.y", String(overlay.text.y));
  form.set("text.fontSize", String(overlay.text.fontSize));
  form.set("text.rotation", String(overlay.text.rotation));
  form.set("text.alignment", overlay.text.alignment);

  const response = await createTemplateRoute(authed("/api/admin/templates", { method: "POST", body: form }));
  expect(response.status).toBe(201);

  const { data } = (await response.json()) as { data: StoredTemplate };
  return data._id;
}

/** Uploads the way a client from before the two-layer editor would. */
async function uploadLegacyTemplate(qrPosition: LegacyPlacement) {
  const form = new FormData();
  form.set("image", new File([await artwork()], "card.png", { type: "image/png" }));
  form.set("name", "Legacy card");
  form.set("type", "");
  form.set("lightPlate", "true");
  for (const [key, value] of Object.entries(qrPosition)) form.set(key, String(value));

  const response = await createTemplateRoute(authed("/api/admin/templates", { method: "POST", body: form }));
  expect(response.status).toBe(201);

  const { data } = (await response.json()) as { data: StoredTemplate };
  return data;
}

async function reopen(templateId: string) {
  const ctx = { params: Promise.resolve({ id: templateId }) } as RouteContext<"/api/admin/templates/[id]">;
  const response = await readTemplateRoute(authed(`/api/admin/templates/${templateId}`), ctx);
  expect(response.status).toBe(200);
  const { data } = (await response.json()) as { data: StoredTemplate };
  return data;
}

async function patch(templateId: string, body: unknown) {
  const ctx = { params: Promise.resolve({ id: templateId }) } as RouteContext<"/api/admin/templates/[id]">;
  return patchTemplateRoute(
    authed(`/api/admin/templates/${templateId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx,
  );
}

async function print(templateId: string, qrId: string) {
  const ctx = { params: Promise.resolve({ qrId }) } as RouteContext<"/api/admin/qr/[qrId]/design">;
  const response = await designRoute(authed(`/api/admin/qr/${qrId}/design?templateId=${templateId}`), ctx);
  expect(response.status).toBe(200);
  return Buffer.from(await response.arrayBuffer());
}

type Box = { left: number; top: number; right: number; bottom: number };

/** Bounding box of every dark pixel inside a window, measured on the printed PNG. */
async function inkBox(png: Buffer, window: { left: number; top: number; width: number; height: number }, threshold = 128): Promise<Box | null> {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const box: Box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };

  for (let y = window.top; y < Math.min(window.top + window.height, info.height); y += 1) {
    for (let x = window.left; x < Math.min(window.left + window.width, info.width); x += 1) {
      if (data[y * info.width + x]! >= threshold) continue;
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
    }
  }

  return box.right < 0 ? null : box;
}

/** Bounding box of pixels of one exact colour, used to find the white plate. */
async function colourBox(png: Buffer, colour: [number, number, number]): Promise<Box | null> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const box: Box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset] !== colour[0] || data[offset + 1] !== colour[1] || data[offset + 2] !== colour[2]) continue;
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
    }
  }

  return box.right < 0 ? null : box;
}

/** Where the composer must have pasted the QR bitmap for this overlay. */
async function expectedQrBox(qrId: string, qr: TemplateOverlay["qr"]) {
  const rendered = await renderQr(qrId, qr.size);
  const left = qr.x + Math.floor((qr.size - rendered.size) / 2);
  const top = qr.y + Math.floor((qr.size - rendered.size) / 2);
  const ink = await inkBox(rendered.buffer, { left: 0, top: 0, width: rendered.size, height: rendered.size });

  return {
    size: rendered.size,
    window: { left, top, width: rendered.size, height: rendered.size },
    ink: {
      left: (ink?.left ?? 0) + left,
      top: (ink?.top ?? 0) + top,
      right: (ink?.right ?? 0) + left,
      bottom: (ink?.bottom ?? 0) + top,
    },
  };
}

/** The window the text must land in, for a given overlay and a real ID. */
function textWindow(text: TemplateOverlay["text"], qrId: string) {
  const box = textBoxFor(text, qrId);
  const radians = (text.rotation * Math.PI) / 180;
  const width = Math.abs(box.width * Math.cos(radians)) + Math.abs(box.height * Math.sin(radians));
  const height = Math.abs(box.width * Math.sin(radians)) + Math.abs(box.height * Math.cos(radians));
  const centre = { x: text.x + box.width / 2, y: text.y + box.height / 2 };

  return {
    left: Math.floor(centre.x - width / 2),
    top: Math.floor(centre.y - height / 2),
    width: Math.ceil(width),
    height: Math.ceil(height),
  };
}

beforeAll(async () => {
  await connectTestDatabase();
});

beforeEach(async () => {
  await resetTestDatabase();
  await signIn();
});

afterEach(async () => {
  const templates = await Template.find({}, { imageKey: 1 }).lean();
  await Promise.all(templates.map((template) => storage.removeTemplateImage(template.imageKey)));
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe("both layers are stored, restored and printed", () => {
  it("stores the overlay exactly as the editor computed it", async () => {
    const overlay = editLikeTheEditor();
    const template = await reopen(await uploadTemplate(overlay));

    expect(template.overlay).toEqual(overlay);
    expect(template.imageWidth).toBe(ARTWORK.width);
    expect(template.imageHeight).toBe(ARTWORK.height);

    // The legacy mirror points at the same square, so old readers keep working.
    expect(template.qrPosition).toEqual(placementFromQr(overlay.qr));
  });

  it("keeps the QR square square through a save and reopen", async () => {
    const template = await reopen(await uploadTemplate(editLikeTheEditor()));

    expect(Object.keys(template.overlay.qr).sort()).toEqual(["size", "x", "y"]);
    expect(template.overlay.qr.size).toBe(template.overlay.qr.size);
    expect(await reopen(template._id)).toEqual(template);
  });

  it("moves one layer without disturbing the other", async () => {
    const start = editLikeTheEditor();
    const templateId = await uploadTemplate(start);

    expect((await patch(templateId, { overlay: { qr: { x: 40 } } })).status).toBe(200);
    const afterQr = await reopen(templateId);
    expect(afterQr.overlay.qr.x).toBe(40);
    expect(afterQr.overlay.text).toEqual(start.text);

    expect((await patch(templateId, { overlay: { text: { fontSize: 14 } } })).status).toBe(200);
    const afterText = await reopen(templateId);
    expect(afterText.overlay.text.fontSize).toBe(14);
    expect(afterText.overlay.qr).toEqual(afterQr.overlay.qr);
  });

  it("prints the QR in exactly the pixels the editor drew", async () => {
    const overlay = editLikeTheEditor();
    const [qrId] = await generateQrCodes(1);
    const png = await print(await uploadTemplate(overlay), qrId);

    expect(await decodeQrText(png)).toBe(env().appUrl + `/q/${qrId}`);

    const expected = await expectedQrBox(qrId, overlay.qr);
    expect(await inkBox(png, expected.window)).toEqual(expected.ink);
  });

  it("prints the ID text at its own coordinates, away from the code", async () => {
    const overlay = editLikeTheEditor();
    const [qrId] = await generateQrCodes(1);
    const png = await print(await uploadTemplate(overlay), qrId);

    const window = textWindow(overlay.text, qrId);
    const label = await inkBox(png, window);

    expect(label).not.toBeNull();

    const qrWindow = (await expectedQrBox(qrId, overlay.qr)).window;
    const overlapsQr = label!.left < qrWindow.left + qrWindow.width && label!.right > qrWindow.left &&
      label!.top < qrWindow.top + qrWindow.height && label!.bottom > qrWindow.top;
    expect(overlapsQr).toBe(false);
  });

  it("prints rotated text inside the bounds the editor reserved", async () => {
    const overlay = editLikeTheEditor();
    expect(overlay.text.rotation).not.toBe(0);

    const [qrId] = await generateQrCodes(1);
    const png = await print(await uploadTemplate(overlay), qrId);

    const window = textWindow(overlay.text, qrId);
    const label = await inkBox(png, window);

    expect(label).not.toBeNull();
    expect(label!.left).toBeGreaterThanOrEqual(window.left);
    expect(label!.right).toBeLessThanOrEqual(window.left + window.width);
    expect(label!.top).toBeGreaterThanOrEqual(window.top);
    expect(label!.bottom).toBeLessThanOrEqual(window.top + window.height);
  });

  it("prints the white plate on exactly the QR square", async () => {
    const overlay = editLikeTheEditor();
    const [qrId] = await generateQrCodes(1);
    const png = await print(await uploadTemplate(overlay), qrId);

    const plate = await colourBox(png, [255, 255, 255]);
    expect(plate).not.toBeNull();
    expect(plate!.left).toBeGreaterThanOrEqual(overlay.qr.x - 1);
    expect(plate!.top).toBeGreaterThanOrEqual(overlay.qr.y - 1);
    expect(plate!.right).toBeLessThanOrEqual(overlay.qr.x + overlay.qr.size);
    expect(plate!.bottom).toBeLessThanOrEqual(overlay.qr.y + overlay.qr.size);
  });

  it("prints the same overlay for every code in a batch", async () => {
    const overlay = editLikeTheEditor();
    const qrIds = await generateQrCodes(3);
    const templateId = await uploadTemplate(overlay);

    for (const qrId of qrIds) {
      const png = await print(templateId, qrId);
      const expected = await expectedQrBox(qrId, overlay.qr);

      expect(await decodeQrText(png)).toBe(env().appUrl + `/q/${qrId}`);
      // Every code lands on the same square, whatever its own payload length.
      expect(await inkBox(png, expected.window)).toEqual(expected.ink);
      expect(await inkBox(png, textWindow(overlay.text, qrId))).not.toBeNull();
    }
  });

  it("prints the same overlay in the ZIP download", async () => {
    const overlay = editLikeTheEditor();
    const [qrId] = await generateQrCodes(1);
    const templateId = await uploadTemplate(overlay);

    const response = await downloadRoute(authed("/api/admin/designs/download", json({ templateId, qrIds: [qrId] })));
    expect(response.status).toBe(200);

    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
    const entry = Buffer.from(await zip.file(`${qrId}.png`)!.async("nodebuffer"));

    expect(await decodeQrText(entry)).toBe(env().appUrl + `/q/${qrId}`);

    const expected = await expectedQrBox(qrId, overlay.qr);
    expect(await inkBox(entry, expected.window)).toEqual(expected.ink);
  });

  it("moves the printed layers when the admin moves them", async () => {
    const overlay = editLikeTheEditor();
    const [qrId] = await generateQrCodes(1);
    const templateId = await uploadTemplate(overlay);

    const first = await expectedQrBox(qrId, overlay.qr);
    const here = await inkBox(await print(templateId, qrId), first.window);

    const moved = { ...overlay, qr: moveQr(overlay.qr, ARTWORK, 60, -40), text: moveText(overlay.text, ARTWORK, REFERENCE_ID, -60, 30) };
    expect((await patch(templateId, { overlay: moved })).status).toBe(200);

    const second = await expectedQrBox(qrId, moved.qr);
    const there = await inkBox(await print(templateId, qrId), second.window);

    expect(there!.left - here!.left).toBe(second.window.left - first.window.left);
    expect(there!.top - here!.top).toBe(second.window.top - first.window.top);
    expect(await inkBox(await print(templateId, qrId), textWindow(moved.text, qrId))).not.toBeNull();
  });

  it("clamps a layer the artwork cannot hold instead of refusing the save", async () => {
    const overlay = editLikeTheEditor();
    const templateId = await uploadTemplate(overlay);

    const response = await patch(templateId, {
      overlay: { qr: { x: 380, y: 590, size: 400 }, text: { x: 4000, y: 4000, fontSize: 90 } },
    });
    expect(response.status).toBe(200);

    const saved = await reopen(templateId);
    expect(saved.overlay.qr.x + saved.overlay.qr.size).toBeLessThanOrEqual(ARTWORK.width);
    expect(saved.overlay.qr.y + saved.overlay.qr.size).toBeLessThanOrEqual(ARTWORK.height);
    expect(saved.overlay.text.x).toBeLessThan(ARTWORK.width);
    expect(saved.overlay.text.y).toBeGreaterThanOrEqual(0);
  });

  it("rejects a patch that sends nothing usable", async () => {
    const templateId = await uploadTemplate(editLikeTheEditor());

    expect((await patch(templateId, { overlay: { qr: { size: -5 } } })).status).toBe(400);
    expect((await patch(templateId, { overlay: { text: { rotation: 900 } } })).status).toBe(400);
    expect((await patch(templateId, { overlay: { text: { alignment: "middle" } } })).status).toBe(400);
  });
});

describe("templates saved before the two-layer editor", () => {
  const LEGACY: LegacyPlacement = { x: 100, y: 380, width: 200, height: 200 };

  it("still uploads from a legacy rectangle", async () => {
    const template = await uploadLegacyTemplate(LEGACY);

    expect(template.overlay.qr).toEqual({ x: LEGACY.x, y: LEGACY.y, size: Math.min(LEGACY.width, LEGACY.height) });
    expect(template.qrPosition).toEqual(LEGACY);
  });

  it("gets a sensible ID printed underneath the code", async () => {
    const template = await uploadLegacyTemplate(LEGACY);
    const [qrId] = await generateQrCodes(1);
    const png = await print(template._id, qrId);

    const qr = template.overlay.qr;
    const text = template.overlay.text;

    // Straight and centred, and clear of the square either way.
    expect(text.rotation).toBe(0);
    expect(text.alignment).toBe("center");
    const box = textBoxFor(text, qrId);
    expect(text.y + box.height <= qr.y || text.y >= qr.y + qr.size).toBe(true);
    expect(text.y).toBeGreaterThanOrEqual(0);
    expect(text.y + box.height).toBeLessThanOrEqual(ARTWORK.height);

    expect(await inkBox(png, textWindow(text, qrId))).not.toBeNull();
    expect(await decodeQrText(png)).toBe(env().appUrl + `/q/${qrId}`);
  });

  it("opens with an editable two-layer overlay", async () => {
    const stored = await uploadLegacyTemplate(LEGACY);
    const templateId = stored._id;

    expect((await patch(templateId, { overlay: { text: { x: 40, y: 120, fontSize: 18, rotation: 45, alignment: "left" } } })).status).toBe(200);

    const reopened = await reopen(templateId);
    expect(reopened.overlay.qr).toEqual(stored.overlay.qr);
    expect(reopened.overlay.text).toEqual({ x: 40, y: 120, fontSize: 18, rotation: 45, alignment: "left" });
  });

  it("reads a document that has no overlay at all", async () => {
    const { _id } = await uploadLegacyTemplate(LEGACY);
    await Template.updateOne({ _id }, { $unset: { overlay: "", qrPosition: "" } });

    const raw = await Template.findById(_id).lean();
    expect(raw?.overlay ?? null).toBeNull();
    expect(raw?.qrPosition ?? null).toBeNull();

    // Nothing to go on but the artwork: both layers come back centred and sane.
    const reopened = await reopen(_id);
    expect(reopened.overlay.qr.size).toBeLessThanOrEqual(Math.min(ARTWORK.width, ARTWORK.height));
    expect(reopened.overlay.qr.x).toBeGreaterThanOrEqual(0);
    expect(reopened.overlay.text.fontSize).toBeGreaterThan(0);
  });

  it("lets an old client still move the QR with a rectangle", async () => {
    const template = await uploadLegacyTemplate(LEGACY);
    const moved: LegacyPlacement = { x: 40, y: 40, width: 260, height: 260 };

    expect((await patch(template._id, { qrPosition: moved })).status).toBe(200);

    const reopened = await reopen(template._id);
    expect(reopened.overlay.qr).toEqual({ x: 40, y: 40, size: 260 });
    // The ID stays where the admin put it.
    expect(reopened.overlay.text).toEqual(template.overlay.text);
  });
});

describe("QR geometry", () => {
  it("never prints past the configured square, however small", async () => {
    for (const size of [64, 74, 120, 400]) {
      expect(printedQrSize("QRA7K29X4P", size)).toBeLessThanOrEqual(size);
    }
  });
});
