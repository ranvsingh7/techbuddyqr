import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import JSZip from "jszip";
import { SignJWT } from "jose";
import {
  connectTestDatabase,
  disconnectTestDatabase,
  gridfsChunkCount,
  gridfsFiles,
  resetTestDatabase,
} from "./helpers/database";
import { templateImageBucket } from "@/lib/gridfs";
import { requestWithIp } from "./helpers/request-scope";
import { decodeQrText } from "./helpers/decode-qr";
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "@/auth/session";
import { activateQr, generateQrCodes } from "@/services/qr";
import { QR } from "@/models/QR";
import { Merchant } from "@/models/Merchant";
import { Template } from "@/models/Template";
import { DELETE as bulkDeleteQr, GET as listQr } from "@/app/api/admin/qr/route";
import { POST as bulkGenerate } from "@/app/api/admin/qr/generate/route";
import { GET as readQr, PATCH as editQrRoute } from "@/app/api/admin/qr/[qrId]/route";
import { GET as listTemplates, POST as createTemplateRoute } from "@/app/api/admin/templates/route";
import { DELETE as deleteTemplateRoute } from "@/app/api/admin/templates/[id]/route";
import { GET as designRoute } from "@/app/api/admin/qr/[qrId]/design/route";
import { POST as downloadRoute } from "@/app/api/admin/designs/download/route";

const cookies = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookies.has(name) ? { name, value: cookies.get(name) } : undefined),
    set: (name: string, value: string) => void cookies.set(name, value),
    delete: (name: string) => void cookies.delete(name),
  }),
}));

const ADMIN_IP = "10.0.0.1";

const signIn = async () => {
  const token = await new SignJWT({ email: env().adminEmail })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(env().authSecret));
  cookies.set(SESSION_COOKIE, token);
};

const signOut = () => cookies.clear();

const authedRequest = (url: string, init?: RequestInit) =>
  requestWithIp(ADMIN_IP, url, init);

const json = (payload: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});

const deletion = (payload: unknown) => ({
  method: "DELETE",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});

/** A blank 400 x 600 card with a light border, like a shop would upload. */
const artwork = () =>
  sharp({
    create: { width: 400, height: 600, channels: 3, background: "#fdfdfb" },
  })
    .png()
    .toBuffer();

const uploadTemplate = async (qrPosition = { x: 100, y: 380, width: 200, height: 200 }) => {
  const form = new FormData();
  form.set("image", new File([await artwork()], "card.png", { type: "image/png" }));
  form.set("name", "Table card");
  form.set("type", "WHATSAPP");
  form.set("lightPlate", "true");
  for (const [key, value] of Object.entries(qrPosition)) form.set(key, String(value));

  const response = await createTemplateRoute(authedRequest("/api/admin/templates", { method: "POST", body: form }));
  const { data } = (await response.json()) as { data: { _id: string } };
  return data._id;
};

beforeAll(async () => {
  await connectTestDatabase();
});

beforeEach(async () => {
  await resetTestDatabase();
  await signIn();
});

/** Files currently in the GridFS artwork bucket. */
const storedArtwork = async () => (await gridfsFiles()).map((file) => String(file._id));

/** Wipes the database between tests; the artwork files go with it. */
afterEach(async () => {
  await resetTestDatabase();
  const bucket = await templateImageBucket();
  await bucket.drop();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe("admin authentication", () => {
  it("refuses every admin API without a session", async () => {
    signOut();

    const response = await listQr(authedRequest("/api/admin/qr"));

    expect(response.status).toBe(401);
    const { error } = (await response.json()) as { error: { code: string } };
    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("refuses a forged session cookie", async () => {
    cookies.set(SESSION_COOKIE, "not.a.real.token");

    const response = await listTemplates();

    expect(response.status).toBe(401);
  });
});

describe("QR management", () => {
  it("generates a batch and returns the new IDs", async () => {
    const response = await bulkGenerate(authedRequest("/api/admin/qr", json({ count: 25 })));

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: { qrIds: string[] } };
    expect(data.qrIds).toHaveLength(25);
    expect(await QR.countDocuments()).toBe(25);
  });

  it("rejects a batch larger than the limit", async () => {
    const response = await bulkGenerate(authedRequest("/api/admin/qr", json({ count: 5000 })));

    expect(response.status).toBe(400);
    const { error } = (await response.json()) as { error: { code: string } };
    expect(error.code).toBe("VALIDATION_ERROR");
  });

  it("lists codes with their merchant joined in", async () => {
    const [qrId] = await generateQrCodes(1);
    await activateQr({
      qrId,
      type: "WHATSAPP",
      destination: "919876543210",
      merchant: { mobile: "919876543210", ownerName: "Asha Rao", businessName: "Corner Shop" },
    });

    const response = await listQr(authedRequest("/api/admin/qr?status=ACTIVE"));
    const { data } = (await response.json()) as { data: { items: Array<{ qrId: string; merchant: { businessName: string } | null }> } };

    expect(data.items).toHaveLength(1);
    expect(data.items[0]!.qrId).toBe(qrId);
    expect(data.items[0]!.merchant?.businessName).toBe("Corner Shop");
  });

  it("returns one QR record with its merchant details", async () => {
    const [qrId] = await generateQrCodes(1);
    const ctx = { params: Promise.resolve({ qrId }) } as RouteContext<"/api/admin/qr/[qrId]">;

    const response = await readQr(authedRequest(`/api/admin/qr/${qrId}`), ctx);

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: { qrId: string; merchantId: unknown } };
    expect(data.qrId).toBe(qrId);
  });

  it("accepts a status-only edit", async () => {
    const [qrId] = await generateQrCodes(1);
    const ctx = { params: Promise.resolve({ qrId }) } as RouteContext<"/api/admin/qr/[qrId]">;

    const response = await editQrRoute(authedRequest(`/api/admin/qr/${qrId}`, json({ status: "INACTIVE" })), ctx);

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: { status: string } };
    expect(data.status).toBe("INACTIVE");
  });

  it("keeps an unassigned QR offline when its destination is edited", async () => {
    const [qrId] = await generateQrCodes(1);
    const ctx = { params: Promise.resolve({ qrId }) } as RouteContext<"/api/admin/qr/[qrId]">;

    const response = await editQrRoute(
      authedRequest(`/api/admin/qr/${qrId}`, json({ type: "GOOGLE_REVIEW", destination: "https://g.page/abc" })),
      ctx,
    );

    expect(response.status).toBe(200);
    const stored = await QR.findOne({ qrId }).lean();
    expect(stored?.status).toBe("GENERATED");
    expect(stored?.destinationUrl).toContain("g.page");
  });

  it("rejects a destination edit without a value", async () => {
    const [qrId] = await generateQrCodes(1);
    const ctx = { params: Promise.resolve({ qrId }) } as RouteContext<"/api/admin/qr/[qrId]">;

    const response = await editQrRoute(authedRequest(`/api/admin/qr/${qrId}`, json({ type: "CUSTOM" })), ctx);

    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown QR code", async () => {
    const ctx = { params: Promise.resolve({ qrId: "QRNOSUCHID" }) } as RouteContext<"/api/admin/qr/[qrId]">;

    const response = await readQr(authedRequest("/api/admin/qr/QRNOSUCHID"), ctx);

    expect(response.status).toBe(404);
  });
});

describe("deleting QR codes", () => {
  it("refuses a bulk delete without a session", async () => {
    const [qrId] = await generateQrCodes(1);
    signOut();

    const response = await bulkDeleteQr(authedRequest("/api/admin/qr", deletion({ qrIds: [qrId] })));

    expect(response.status).toBe(401);
    const { error } = (await response.json()) as { error: { code: string } };
    expect(error.code).toBe("UNAUTHORIZED");

    signIn();
    expect(await QR.countDocuments()).toBe(1);
  });

  it("deletes a single QR code and reports how many went", async () => {
    const [qrId] = await generateQrCodes(1);

    const response = await bulkDeleteQr(authedRequest("/api/admin/qr", deletion({ qrIds: [qrId] })));

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: { deleted: number } };
    expect(data.deleted).toBe(1);
    expect(await QR.countDocuments()).toBe(0);
  });

  it("deletes a batch in one request, in any case and without double counting", async () => {
    const qrIds = await generateQrCodes(3);

    const response = await bulkDeleteQr(
      authedRequest("/api/admin/qr", deletion({ qrIds: [qrIds[0]!.toLowerCase(), qrIds[1]!, qrIds[1]!] })),
    );

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: { deleted: number } };
    expect(data.deleted).toBe(2);
    // Only the requested codes are gone.
    expect(await QR.countDocuments()).toBe(1);
    expect((await QR.findOne({}).lean())?.qrId).toBe(qrIds[2]);
  });

  it("rejects an empty list", async () => {
    await generateQrCodes(1);

    const response = await bulkDeleteQr(authedRequest("/api/admin/qr", deletion({ qrIds: [] })));

    expect(response.status).toBe(400);
    const { error } = (await response.json()) as { error: { code: string; details: Record<string, string> } };
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details.qrIds).toBeTruthy();
    expect(await QR.countDocuments()).toBe(1);
  });

  it("rejects an ID that is not a QR code, and deletes nothing", async () => {
    const [qrId] = await generateQrCodes(1);

    const response = await bulkDeleteQr(authedRequest("/api/admin/qr", deletion({ qrIds: [qrId, "not-a-qr"] })));

    expect(response.status).toBe(400);
    const { error } = (await response.json()) as { error: { details: Record<string, string> } };
    expect(error.details["qrIds.1"]).toBe("Invalid QR ID");
    expect(await QR.countDocuments()).toBe(1);
  });

  it("reports nothing deleted for codes that do not exist", async () => {
    await generateQrCodes(1);

    const response = await bulkDeleteQr(
      authedRequest("/api/admin/qr", deletion({ qrIds: ["QRNOSUCHID", "QRALSOGONE"] })),
    );

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: { deleted: number } };
    expect(data.deleted).toBe(0);
    expect(await QR.countDocuments()).toBe(1);
  });

  it("deletes an ACTIVE code, leaving its merchant in place", async () => {
    const [qrId] = await generateQrCodes(1);
    await activateQr({
      qrId,
      type: "WHATSAPP",
      destination: "919876543210",
      merchant: { mobile: "919876543210", ownerName: "Asha Rao", businessName: "Corner Shop" },
    });

    const response = await bulkDeleteQr(authedRequest("/api/admin/qr", deletion({ qrIds: [qrId] })));

    expect(response.status).toBe(200);
    expect(await QR.countDocuments()).toBe(0);
    // The shop survives its card.
    expect(await Merchant.countDocuments()).toBe(1);
  });

  it("leaves merchants and templates untouched", async () => {
    const templateId = await uploadTemplate();
    const qrIds = await generateQrCodes(3);
    await activateQr({
      qrId: qrIds[0]!,
      type: "CUSTOM",
      destination: "https://example.com/menu",
      merchant: { mobile: "919876543210", ownerName: "Asha Rao", businessName: "Corner Shop" },
    });

    const response = await bulkDeleteQr(authedRequest("/api/admin/qr", deletion({ qrIds: [qrIds[0]!] })));

    expect(response.status).toBe(200);
    expect(await QR.countDocuments({ qrId: { $ne: qrIds[0] } })).toBe(2);
    expect(await Merchant.countDocuments()).toBe(1);
    expect(await Template.findById(templateId).lean()).not.toBeNull();
  });

  it("takes deleted codes out of the admin list", async () => {
    const qrIds = await generateQrCodes(2);

    await bulkDeleteQr(authedRequest("/api/admin/qr", deletion({ qrIds: [qrIds[0]!] })));
    const response = await listQr(authedRequest("/api/admin/qr"));
    const { data } = (await response.json()) as { data: { items: Array<{ qrId: string }>; total: number } };

    expect(data.total).toBe(1);
    expect(data.items.map((item) => item.qrId)).toEqual([qrIds[1]]);
  });

  it("returns 404 when the deleted code is read back", async () => {
    const [qrId] = await generateQrCodes(1);
    const ctx = { params: Promise.resolve({ qrId }) } as RouteContext<"/api/admin/qr/[qrId]">;

    await bulkDeleteQr(authedRequest("/api/admin/qr", deletion({ qrIds: [qrId] })));

    expect((await readQr(authedRequest(`/api/admin/qr/${qrId}`), ctx)).status).toBe(404);
  });
});

describe("templates and designs", () => {
  it("stores the artwork outside MongoDB and records only its metadata", async () => {
    const templateId = await uploadTemplate();
    const template = await Template.findById(templateId).lean();

    expect(template?.name).toBe("Table card");
    expect(template?.imageWidth).toBe(400);
    expect(template?.imageHeight).toBe(600);
    expect(template?.imageFileId).toBeTruthy();
    expect(template?.imageKey).toBeNull();
    expect(Object.keys(template ?? {}).some((key) => key.includes("binary"))).toBe(false);
  });

  it("pulls a placement that hangs off the artwork back onto it", async () => {
    const form = new FormData();
    form.set("image", new File([await artwork()], "card.png", { type: "image/png" }));
    form.set("name", "Hanging off the edge");
    form.set("type", "");
    form.set("lightPlate", "true");
    for (const [key, value] of Object.entries({ x: 300, y: 500, width: 200, height: 200 })) form.set(key, String(value));

    const before = await storedArtwork();
    const response = await createTemplateRoute(authedRequest("/api/admin/templates", { method: "POST", body: form }));
    const { data } = (await response.json()) as { data: { _id: string } };
    const template = await Template.findById(data._id).lean();

    expect(response.status).toBe(201);
    expect(template?.overlay?.qr).toEqual({ x: 200, y: 400, size: 200 });
    expect(template?.overlay?.text?.y).toBeGreaterThanOrEqual(0);
    // One artwork in the bucket for this template, and both layers inside it.
    expect((await storedArtwork()).length).toBe(before.length + 1);
    expect((template?.overlay?.qr?.x ?? 0) + (template?.overlay?.qr?.size ?? 0)).toBeLessThanOrEqual(template?.imageWidth ?? 0);
  });

  it("refuses an unusable upload and leaves nothing behind", async () => {
    const form = new FormData();
    form.set("image", new File([Buffer.from("not an image")], "card.png", { type: "image/png" }));
    form.set("name", "Broken");
    form.set("type", "");
    form.set("lightPlate", "true");
    for (const [key, value] of Object.entries({ x: 100, y: 380, width: 200, height: 200 })) form.set(key, String(value));

    const before = await storedArtwork();
    const response = await createTemplateRoute(authedRequest("/api/admin/templates", { method: "POST", body: form }));

    expect(response.status).toBe(400);
    expect(await Template.countDocuments()).toBe(0);
    // The rejected upload must not be left behind in the bucket.
    expect(await storedArtwork()).toEqual(before);
  });

  it("renders one design whose QR still scans after the artwork is applied", async () => {
    const templateId = await uploadTemplate();
    const [qrId] = await generateQrCodes(1);
    const ctx = { params: Promise.resolve({ qrId }) } as RouteContext<"/api/admin/qr/[qrId]/design">;

    const response = await designRoute(authedRequest(`/api/admin/qr/${qrId}/design?templateId=${templateId}`), ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");

    const png = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(png).metadata();
    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(600);
    expect(await decodeQrText(png)).toBe(env().appUrl + `/q/${qrId}`);
  });

  it("downloads a ZIP with one file per QR code", async () => {
    const templateId = await uploadTemplate();
    const qrIds = await generateQrCodes(3);

    const response = await downloadRoute(authedRequest("/api/admin/designs/download", json({ templateId, qrIds })));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toMatch(/filename="qr-batch-\d{8}\.zip"/);

    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(qrIds.map((qrId) => `${qrId}.png`).sort());

    const entry = await zip.file(`${qrIds[0]}.png`)!.async("uint8array");
    expect(await decodeQrText(Buffer.from(entry))).toBe(env().appUrl + `/q/${qrIds[0]}`);
  });

  it("deletes a template together with its artwork file", async () => {
    const templateId = await uploadTemplate();
    const template = await Template.findById(templateId).lean();
    expect(await storedArtwork()).toContain(String(template?.imageFileId));

    const ctx = { params: Promise.resolve({ id: templateId }) } as RouteContext<"/api/admin/templates/[id]">;
    const response = await deleteTemplateRoute(authedRequest(`/api/admin/templates/${templateId}`), ctx);

    expect(response.status).toBe(200);
    expect(await Template.countDocuments()).toBe(0);
    expect(await storedArtwork()).not.toContain(String(template?.imageFileId));
    // The chunks go with the file, so nothing is left occupying space.
    expect(await gridfsChunkCount()).toBe(0);
  });

  it("refuses to print a design for a QR code that was never generated", async () => {
    const templateId = await uploadTemplate();
    const ctx = { params: Promise.resolve({ qrId: "QRNOTREAL1" }) } as RouteContext<"/api/admin/qr/[qrId]/design">;

    const response = await designRoute(authedRequest(`/api/admin/qr/QRNOTREAL1/design?templateId=${templateId}`), ctx);

    expect(response.status).toBe(404);
    const { error } = (await response.json()) as { error: { code: string } };
    expect(error.code).toBe("QR_NOT_FOUND");
  });

  it("prints one file per code when a batch repeats an ID", async () => {
    const templateId = await uploadTemplate();
    const [qrId] = await generateQrCodes(1);

    const response = await downloadRoute(
      authedRequest("/api/admin/designs/download", json({ templateId, qrIds: [qrId, qrId.toLowerCase()] })),
    );

    expect(response.status).toBe(200);
    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
    expect(Object.keys(zip.files)).toEqual([`${qrId}.png`]);
  });

  it("refuses a batch above the ZIP limit", async () => {
    const templateId = await uploadTemplate();

    const response = await downloadRoute(
      authedRequest(
        "/api/admin/designs/download",
        json({ templateId, qrIds: Array.from({ length: 101 }, (_, index) => `QRTEST${String(index).padStart(4, "0")}`) }),
      ),
    );

    expect(response.status).toBe(400);
  });
});
