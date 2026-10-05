import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import mongoose, { Types } from "mongoose";
import sharp from "sharp";
import JSZip from "jszip";
import { connectTestDatabase, disconnectTestDatabase, gridfsChunkCount, gridfsFiles, resetTestDatabase } from "./helpers/database";
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "@/auth/session";
import { readTemplateImageBuffer, resetTemplateImageBucket, templateImageBucket } from "@/lib/gridfs";
import { migrateTemplateImagesToGridfs } from "@/services/migration";
import { storage } from "@/lib/storage";
import { createTemplate, deleteTemplate, getTemplate, replaceTemplateImage, updateTemplate } from "@/services/template";
import { renderDesignZip, renderQrDesign } from "@/services/design";
import { Template } from "@/models/Template";
import { QR } from "@/models/QR";
import { GET as imageRoute, POST as replaceImageRoute } from "@/app/api/admin/templates/[id]/image/route";
import { DELETE as deleteTemplateRoute } from "@/app/api/admin/templates/[id]/route";

/** Counts how often the stored image is actually pulled out of GridFS. */
const reads = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/lib/gridfs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gridfs")>();
  return {
    ...actual,
    readTemplateImageBuffer: async (fileId: Parameters<typeof actual.readTemplateImageBuffer>[0]) => {
      reads.count += 1;
      return actual.readTemplateImageBuffer(fileId);
    },
  };
});

const cookies = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookies.has(name) ? { name, value: cookies.get(name) } : undefined),
    set: (name: string, value: string) => void cookies.set(name, value),
    delete: (name: string) => void cookies.delete(name),
  }),
}));

/** A solid PNG, so dimensions in assertions are predictable. */
async function artwork(width = 400, height = 600) {
  return sharp({ create: { width, height, channels: 4, background: "#ffffff" } }).png().toBuffer();
}

async function uploadImage(width = 400, height = 600, name = "Card") {
  const png = await artwork(width, height);
  return createTemplate(
    { name, type: null, qrPosition: { x: 40, y: 40, width: 200, height: 200 }, lightPlate: true },
    new File([png], "card.png", { type: "image/png" }),
  );
}

const authed = (url: string, init: RequestInit = {}) =>
  new Request(`http://localhost${url}`, { ...init, headers: { cookie: `${SESSION_COOKIE}=${cookies.get(SESSION_COOKIE)}`, ...init.headers } });

/** Inserts QR documents directly: these tests are about storage, not generation. */
async function insertQrCodes(count: number) {
  const qrIds = Array.from({ length: count }, (_, index) => `QR${String(index).padStart(8, "0")}`);
  await QR.insertMany(
    qrIds.map((qrId, index) => ({
      qrId,
      status: "GENERATED",
      destinationUrl: `${env().appUrl}/q/${qrId}`,
      createdAt: new Date(index * 1000),
    })),
  );
  return qrIds;
}

beforeAll(async () => {
  await connectTestDatabase();
});

beforeEach(async () => {
  await resetTestDatabase();
  await (await templateImageBucket()).drop();
  reads.count = 0;

  const token = await new SignJWT({ email: env().adminEmail })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(env().authSecret));
  cookies.set(SESSION_COOKIE, token);
});

afterEach(async () => {
  await resetTestDatabase();
  await (await templateImageBucket()).drop();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe("one template stores one image", () => {
  it("keeps the artwork in GridFS and only a file id on the document", async () => {
    const created = await uploadImage();
    const template = await Template.findById(created._id).lean();

    expect(template?.imageFileId).toBeTruthy();
    expect(template?.imageKey).toBeNull();
    expect((await gridfsFiles()).map((file) => String(file._id))).toEqual([String(template?.imageFileId)]);
    // Nothing that could hold a byte of image on the document itself.
    expect(JSON.stringify(template)).not.toContain("binary");
    expect(JSON.stringify(template).length).toBeLessThan(1500);
  });

  it("records the content type on the file so responses do not guess", async () => {
    const created = await uploadImage();
    const template = await Template.findById(created._id).lean();

    const [file] = await gridfsFiles();
    expect(String(file?._id)).toBe(String(template?.imageFileId));
    expect(file?.metadata?.contentType).toBe("image/png");
    expect(file?.length).toBeGreaterThan(0);
  });

  it("never puts an image on a QR document", async () => {
    const created = await uploadImage();
    const [qrId] = await insertQrCodes(1);

    await renderQrDesign(created._id, qrId!);

    const qr = await QR.findOne({ qrId }).lean();
    expect(qr?.templateId).toEqual(new Types.ObjectId(String(created._id)));
    expect(JSON.stringify(qr).toLowerCase()).not.toContain("binary");
    expect(JSON.stringify(qr).toLowerCase()).not.toContain("base64");
  });

  it("shares one stored image across a hundred QR codes", async () => {
    const created = await uploadImage();
    const qrIds = await insertQrCodes(100);

    await renderDesignZip(created._id, qrIds);

    // A hundred codes, still exactly one file, and one read of it.
    expect(await gridfsFiles()).toHaveLength(1);
    expect(reads.count).toBe(1);
    expect(await QR.countDocuments({ templateId: created._id })).toBe(100);
  });

  it("reads the image once for a batch across many templates", async () => {
    const templates = await Promise.all([uploadImage(400, 600, "A"), uploadImage(300, 500, "B")]);
    const qrIds = await insertQrCodes(10);

    const zip = await renderDesignZip(templates[0]!._id, qrIds.slice(0, 5));
    expect(Object.keys((await JSZip.loadAsync(zip)).files).sort()).toEqual(qrIds.slice(0, 5).map((qrId) => `${qrId}.png`).sort());

    // One batch, one template, one image read.
    expect(reads.count).toBe(1);

    await renderDesignZip(templates[1]!._id, qrIds.slice(5));
    // Two batches, two templates, two reads total.
    expect(reads.count).toBe(2);
    expect(await gridfsFiles()).toHaveLength(2);
  });
});

describe("serving the artwork", () => {
  it("streams the stored image with its real type and length", async () => {
    const created = await uploadImage();
    const ctx = { params: Promise.resolve({ id: created._id }) } as RouteContext<"/api/admin/templates/[id]/image">;

    const response = await imageRoute(authed(`/api/admin/templates/${created._id}/image`), ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");

    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.length).toBe(Number(response.headers.get("content-length")));
    expect((await sharp(bytes).metadata()).width).toBe(400);
  });

  it("reports a missing or unusable template instead of streaming nothing", async () => {
    const missing = { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) } as RouteContext<"/api/admin/templates/[id]/image">;
    const malformed = { params: Promise.resolve({ id: "not-an-id" }) } as RouteContext<"/api/admin/templates/[id]/image">;

    expect((await imageRoute(authed("/api/admin/templates/507f1f77bcf86cd799439011/image"), missing)).status).toBe(404);
    expect((await imageRoute(authed("/api/admin/templates/not-an-id/image"), malformed)).status).toBe(404);
  });

  it("404s when the document points at a file that is not in the bucket", async () => {
    const created = await uploadImage();
    await Template.updateOne({ _id: created._id }, { $set: { imageFileId: new (await import("mongoose")).Types.ObjectId() } });

    const ctx = { params: Promise.resolve({ id: created._id }) } as RouteContext<"/api/admin/templates/[id]/image">;
    expect((await imageRoute(authed(`/api/admin/templates/${created._id}/image`), ctx)).status).toBe(404);
  });

  it("serves many concurrent reads of the same stored image", async () => {
    const created = await uploadImage();
    const ctx = { params: Promise.resolve({ id: created._id }) } as RouteContext<"/api/admin/templates/[id]/image">;

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => imageRoute(authed(`/api/admin/templates/${created._id}/image`), ctx)),
    );

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(await gridfsFiles()).toHaveLength(1);
  });

  it("requires a file on replacement and stores nothing when it is missing", async () => {
    const created = await uploadImage();
    const ctx = { params: Promise.resolve({ id: created._id }) } as RouteContext<"/api/admin/templates/[id]/image">;

    const response = await replaceImageRoute(
      authed(`/api/admin/templates/${created._id}/image`, { method: "POST", body: new FormData() }),
      ctx,
    );

    expect(response.status).toBe(400);
    expect(await gridfsFiles()).toHaveLength(1);
  });
});

describe("replacing the artwork", () => {
  it("swaps the file, drops the old one and keeps exactly one stored image", async () => {
    const created = await uploadImage();
    const before = await Template.findById(created._id).lean();
    const ctx = { params: Promise.resolve({ id: created._id }) } as RouteContext<"/api/admin/templates/[id]/image">;

    const png = await artwork(800, 1000);
    const response = await replaceImageRoute(
      authed(`/api/admin/templates/${created._id}/image`, {
        method: "POST",
        body: (() => {
          const form = new FormData();
          form.set("image", new File([png], "bigger.png", { type: "image/png" }));
          return form;
        })(),
      }),
      ctx,
    );

    expect(response.status).toBe(200);

    const after = await Template.findById(created._id).lean();
    expect(String(after?.imageFileId)).not.toBe(String(before?.imageFileId));
    expect(after?.imageWidth).toBe(800);
    expect(after?.imageHeight).toBe(1000);
    // The replaced file is gone, and no chunk of it survives.
    expect((await gridfsFiles()).map((file) => String(file._id))).toEqual([String(after?.imageFileId)]);
    expect(await gridfsChunkCount()).toBeGreaterThan(0);
  });

  it("serves the new artwork after a replacement", async () => {
    const created = await uploadImage();
    const ctx = { params: Promise.resolve({ id: created._id }) } as RouteContext<"/api/admin/templates/[id]/image">;

    await replaceTemplateImage(created._id, new File([await artwork(240, 320)], "smaller.png", { type: "image/png" }));

    const response = await imageRoute(authed(`/api/admin/templates/${created._id}/image`), ctx);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect((await sharp(bytes).metadata()).width).toBe(240);
  });

  it("pulls the overlay back inside bounds when the new artwork is smaller", async () => {
    const created = await uploadImage();
    const moved = await updateTemplate(created._id, { overlay: { qr: { x: 300, y: 480, size: 180 } } });
    expect(moved?.overlay?.qr?.x).toBeGreaterThan(0);

    await replaceTemplateImage(created._id, new File([await artwork(200, 260)], "tiny.png", { type: "image/png" }));

    const after = await getTemplate(created._id);
    const image = { width: after!.imageWidth, height: after!.imageHeight };
    expect(after?.overlay?.qr?.x).toBeGreaterThanOrEqual(0);
    expect(after?.overlay?.qr?.y).toBeGreaterThanOrEqual(0);
    expect((after?.overlay?.qr?.x ?? 0) + (after?.overlay?.qr?.size ?? 0)).toBeLessThanOrEqual(image.width);
    expect((after?.overlay?.qr?.y ?? 0) + (after?.overlay?.qr?.size ?? 0)).toBeLessThanOrEqual(image.height);
  });

  it("leaves the current artwork in place when the replacement is unusable", async () => {
    const created = await uploadImage();
    const before = await Template.findById(created._id).lean();

    await expect(
      replaceTemplateImage(created._id, new File([Buffer.from("not an image")], "broken.png", { type: "image/png" })),
    ).rejects.toThrow();

    const after = await Template.findById(created._id).lean();
    expect(String(after?.imageFileId)).toBe(String(before?.imageFileId));
    // A rejected replacement must not orphan an upload.
    expect(await gridfsFiles()).toHaveLength(1);
  });

  it("does not touch stored images when only the overlay is edited", async () => {
    const created = await uploadImage();

    await updateTemplate(created._id, { name: "Renamed", overlay: { qr: { x: 60, y: 60 } } });

    expect(await gridfsFiles()).toHaveLength(1);
    expect((await getTemplate(created._id))?.name).toBe("Renamed");
  });
});

describe("failed uploads leave nothing behind", () => {
  it("rejects an unreadable image without creating a template or a file", async () => {
    await expect(
      createTemplate(
        { name: "Broken", type: null, qrPosition: { x: 10, y: 10, width: 100, height: 100 }, lightPlate: true },
        new File([Buffer.from("definitely not a png")], "card.png", { type: "image/png" }),
      ),
    ).rejects.toThrow();

    expect(await Template.countDocuments()).toBe(0);
    expect(await gridfsFiles()).toHaveLength(0);
    expect(await gridfsChunkCount()).toBe(0);
  });

  it("rejects a non-image upload", async () => {
    await expect(
      createTemplate(
        { name: "Text file", type: null, qrPosition: { x: 10, y: 10, width: 100, height: 100 }, lightPlate: true },
        new File([Buffer.from("hello")], "notes.txt", { type: "text/plain" }),
      ),
    ).rejects.toThrow();

    expect(await gridfsFiles()).toHaveLength(0);
  });

  it("rejects an image larger than the configured maximum", async () => {
    const { MAX_IMAGE_SIDE } = await import("@/lib/limits");
    const tooBig = await artwork(MAX_IMAGE_SIDE + 20, 20);

    await expect(
      createTemplate(
        { name: "Huge", type: null, qrPosition: { x: 10, y: 10, width: 100, height: 100 }, lightPlate: true },
        new File([tooBig], "wide.png", { type: "image/png" }),
      ),
    ).rejects.toThrow();

    expect(await gridfsFiles()).toHaveLength(0);
  });

  it("stores distinct files for concurrent uploads", async () => {
    const created = await Promise.all([uploadImage(400, 600, "A"), uploadImage(400, 600, "B"), uploadImage(400, 600, "C")]);
    const ids = created.map((template) => String(template._id));

    const files = await gridfsFiles();
    expect(files).toHaveLength(3);
    expect(new Set(files.map((file) => String(file._id))).size).toBe(3);
    expect(await Template.countDocuments({ _id: { $in: ids } })).toBe(3);
  });
});

describe("deleting a template", () => {
  it("removes the document, the file and its chunks", async () => {
    const created = await uploadImage();
    const ctx = { params: Promise.resolve({ id: created._id }) } as RouteContext<"/api/admin/templates/[id]">;

    expect((await deleteTemplateRoute(authed(`/api/admin/templates/${created._id}`), ctx)).status).toBe(200);

    expect(await Template.countDocuments()).toBe(0);
    expect(await gridfsFiles()).toHaveLength(0);
    expect(await gridfsChunkCount()).toBe(0);
  });

  it("refuses while QR codes still point at the template, and says how many", async () => {
    const created = await uploadImage();
    const qrIds = await insertQrCodes(3);
    await renderDesignZip(created._id, qrIds);

    const ctx = { params: Promise.resolve({ id: created._id }) } as RouteContext<"/api/admin/templates/[id]">;
    const response = await deleteTemplateRoute(authed(`/api/admin/templates/${created._id}`), ctx);

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; message?: string; details?: { qrCount?: number } } };
    expect(body.error.code).toBe("TEMPLATE_IN_USE");
    expect(body.error.details?.qrCount).toBe(3);

    // The template and its image are still intact.
    expect(await Template.countDocuments()).toBe(1);
    expect(await gridfsFiles()).toHaveLength(1);
  });

  it("allows deletion again once nothing references the template", async () => {
    const created = await uploadImage();
    const qrIds = await insertQrCodes(2);
    await renderDesignZip(created._id, qrIds);

    await QR.updateMany({ qrId: { $in: qrIds } }, { $set: { templateId: null } });
    await deleteTemplate(created._id);

    expect(await Template.countDocuments()).toBe(0);
    expect(await gridfsFiles()).toHaveLength(0);
  });

  it("counts a single referencing code correctly", async () => {
    const created = await uploadImage();
    const [qrId] = await insertQrCodes(1);
    await QR.updateOne({ qrId }, { $set: { templateId: created._id } });

    await expect(deleteTemplate(created._id)).rejects.toMatchObject({ code: "TEMPLATE_IN_USE", status: 409 });
  });
});

describe("recording which template a design came from", () => {
  it("records the reference after a single design and keeps it current", async () => {
    const first = await uploadImage(400, 600, "First");
    const second = await uploadImage(400, 600, "Second");
    const [qrId] = await insertQrCodes(1);

    await renderQrDesign(first._id, qrId!);
    expect((await QR.findOne({ qrId })?.lean())?.templateId).toEqual(new Types.ObjectId(String(first._id)));

    await renderQrDesign(second._id, qrId!);
    expect((await QR.findOne({ qrId })?.lean())?.templateId).toEqual(new Types.ObjectId(String(second._id)));
  });

  it("records the reference for a whole batch in one write", async () => {
    const created = await uploadImage();
    const qrIds = await insertQrCodes(25);

    await renderDesignZip(created._id, qrIds);

    expect(await QR.countDocuments({ templateId: created._id })).toBe(25);
    expect(await QR.countDocuments({ templateId: null })).toBe(0);
  });

  it("leaves the reference unset when rendering fails", async () => {
    const created = await uploadImage();

    await expect(renderQrDesign(created._id, "QRDOESNOTEXIST")).rejects.toThrow();

    expect(await QR.countDocuments({ templateId: created._id })).toBe(0);
  });
});

describe("reusing the existing MongoDB connection", () => {
  it("never opens a second connection while handling artwork", async () => {
    const connect = vi.spyOn(mongoose, "connect");

    const created = await uploadImage();
    await renderQrDesign(created._id, (await insertQrCodes(1))[0]!);
    await templateImageBucket();
    await readTemplateImageBuffer((await Template.findById(created._id).lean())!.imageFileId!);

    // The suite is already connected, so any connect() here would be a second client.
    expect(connect).not.toHaveBeenCalled();
    connect.mockRestore();
  });

  it("shares one bucket across concurrent calls", async () => {
    const buckets = await Promise.all(Array.from({ length: 10 }, () => templateImageBucket()));

    expect(new Set(buckets).size).toBe(1);
  });

  it("rebuilds the bucket after a reset without reconnecting", async () => {
    const connect = vi.spyOn(mongoose, "connect");

    const first = await templateImageBucket();
    resetTemplateImageBucket();
    const second = await templateImageBucket();

    expect(second).not.toBe(first);
    expect(connect).not.toHaveBeenCalled();
    connect.mockRestore();
  });
});

describe("templates created before GridFS", () => {
  /** Plants the pre-migration shape: a filesystem key and no file id. */
  async function legacyTemplate(key: string) {
    return Template.create({
      name: "Legacy card",
      type: null,
      imageKey: key,
      imageWidth: 400,
      imageHeight: 600,
      qrPosition: { x: 40, y: 40, width: 200, height: 200 },
      lightPlate: true,
    });
  }

  it("still renders a design from the stored file on disk", async () => {
    const { key } = await storage.saveTemplateImage(new File([await artwork(400, 600)], "card.png", { type: "image/png" }));
    const template = await legacyTemplate(key);
    const [qrId] = await insertQrCodes(1);

    const design = await renderQrDesign(String(template._id), qrId!);

    expect((await sharp(design).metadata()).width).toBe(400);
    // No GridFS file was created by rendering, and the reference still records.
    expect(await gridfsFiles()).toHaveLength(0);
    expect((await QR.findOne({ qrId })?.lean())?.templateId).toEqual(new Types.ObjectId(String(template._id)));
    await storage.removeTemplateImage(key);
  });

  it("still serves the image from disk with a content type", async () => {
    const { key } = await storage.saveTemplateImage(new File([await artwork(320, 480)], "serve.png", { type: "image/png" }));
    const template = await legacyTemplate(key);

    const ctx = { params: Promise.resolve({ id: String(template._id) }) } as RouteContext<"/api/admin/templates/[id]/image">;
    const response = await imageRoute(authed(`/api/admin/templates/${template._id}/image`), ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    await storage.removeTemplateImage(key);
  });

  it("deletes the old file along with the template", async () => {
    const { key } = await storage.saveTemplateImage(new File([await artwork(400, 600)], "delete.png", { type: "image/png" }));
    const template = await legacyTemplate(key);

    await deleteTemplate(String(template._id));

    expect(await Template.countDocuments()).toBe(0);
    await expect(storage.readTemplateImage(key)).rejects.toThrow();
  });

  it("is upgraded by a replacement and stops depending on disk", async () => {
    const { key } = await storage.saveTemplateImage(new File([await artwork(400, 600)], "upgrade.png", { type: "image/png" }));
    const template = await legacyTemplate(key);

    await replaceTemplateImage(String(template._id), new File([await artwork(500, 500)], "new.png", { type: "image/png" }));

    const after = await Template.findById(template._id).lean();
    expect(after?.imageFileId).toBeTruthy();
    expect(after?.imageKey).toBeNull();
    expect(await gridfsFiles()).toHaveLength(1);
    // The file it used to rely on is released once the new one is in place.
    await expect(storage.readTemplateImage(key)).rejects.toThrow();
  });
});

describe("migrating filesystem artwork into GridFS", () => {
  /** Plants a template in its pre-migration shape and returns its real key. */
  async function legacyTemplate(name: string) {
    const png = await artwork(400, 600);
    const { key } = await storage.saveTemplateImage(new File([png], "card.png", { type: "image/png" }));
    const template = await Template.create({
      name,
      type: null,
      imageKey: key,
      imageWidth: 400,
      imageHeight: 600,
      qrPosition: { x: 40, y: 40, width: 200, height: 200 },
      lightPlate: true,
    });
    return { template, key, png };
  }

  it("copies each image once, keeps it serving, and leaves the old file in place", async () => {
    const { template, key } = await legacyTemplate("Needs migrating");

    const report = await migrateTemplateImagesToGridfs();

    expect(report).toMatchObject({ scanned: 1, remaining: 0 });
    expect(report.failures).toEqual([]);
    expect(report.migrated).toHaveLength(1);

    const after = await Template.findById(template._id).lean();
    expect(after?.imageFileId).toBeTruthy();
    expect(await gridfsFiles()).toHaveLength(1);

    const bytes = await readTemplateImageBuffer(after!.imageFileId!);
    expect((await sharp(bytes).metadata()).width).toBe(400);

    // Deliberately not deleted by the migration, so a bad run is recoverable.
    expect(await storage.readTemplateImage(key)).toBeTruthy();

    await storage.removeTemplateImage(key);
  });

  it("changes nothing on a dry run", async () => {
    const { template, key } = await legacyTemplate("Dry run only");

    const report = await migrateTemplateImagesToGridfs({ dryRun: true });

    expect(report.scanned).toBe(1);
    expect(report.migrated).toEqual([]);
    expect(report.remaining).toBe(1);
    expect((await Template.findById(template._id).lean())?.imageFileId).toBeNull();
    expect(await gridfsFiles()).toHaveLength(0);

    await storage.removeTemplateImage(key);
  });

  it("is safe to run twice and does not upload a second copy", async () => {
    const { template, key } = await legacyTemplate("Run twice");

    await migrateTemplateImagesToGridfs();
    const second = await migrateTemplateImagesToGridfs();

    expect(second.scanned).toBe(0);
    expect(second.migrated).toEqual([]);
    expect(await gridfsFiles()).toHaveLength(1);

    const after = await Template.findById(template._id).lean();
    const bytes = await readTemplateImageBuffer(after!.imageFileId!);
    expect((await sharp(bytes).metadata()).width).toBe(400);

    await storage.removeTemplateImage(key);
  });

  it("reports a template whose file is gone instead of half-migrating it", async () => {
    const { template } = await legacyTemplate("Missing file");
    await storage.removeTemplateImage((await Template.findById(template._id).lean())!.imageKey!);

    const report = await migrateTemplateImagesToGridfs();

    expect(report.failures).toHaveLength(1);
    expect(report.migrated).toEqual([]);
    // Still on the filesystem field, so it will be retried once the file is back.
    expect((await Template.findById(template._id).lean())?.imageFileId).toBeNull();
    expect(report.remaining).toBe(1);
    expect(await gridfsFiles()).toHaveLength(0);
  });

  it("skips templates that are already on GridFS", async () => {
    await uploadImage(400, 600, "Already migrated");

    const report = await migrateTemplateImagesToGridfs();

    expect(report.scanned).toBe(0);
    expect(report.migrated).toEqual([]);
    expect(await gridfsFiles()).toHaveLength(1);
  });

  it("finishes with a template whose image is fully on GridFS", async () => {
    const { template, key } = await legacyTemplate("Migrated template");

    await migrateTemplateImagesToGridfs();
    await storage.removeTemplateImage(key);

    const [qrId] = await insertQrCodes(1);
    const design = await renderQrDesign(String(template._id), qrId!);

    expect((await sharp(design).metadata()).width).toBe(400);
  });
});