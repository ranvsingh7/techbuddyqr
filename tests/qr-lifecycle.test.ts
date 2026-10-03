import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connectTestDatabase, disconnectTestDatabase, resetTestDatabase } from "./helpers/database";
import { activateQr, editQr, findQrById, generateQrCodes, generateUniqueQrId, reassignQr } from "@/services/qr";
import { QR } from "@/models/QR";
import { Merchant } from "@/models/Merchant";
import { ApiError } from "@/lib/api-error";
import { QR_ID_PATTERN } from "@/types";

const merchant = (suffix: string) => ({
  mobile: `9198765432${suffix.slice(0, 2)}`,
  ownerName: "Asha Rao",
  businessName: `Sharma Tea Stall ${suffix}`,
});

beforeEach(async () => {
  await connectTestDatabase();
  await resetTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe("QR ID generation", () => {
  it("creates unique, well-formed IDs", async () => {
    const ids = await generateQrCodes(50);

    expect(ids).toHaveLength(50);
    expect(new Set(ids).size).toBe(50);
    for (const id of ids) expect(id).toMatch(QR_ID_PATTERN);
  });

  it("never returns a duplicate when batches are generated concurrently", async () => {
    const batches = await Promise.all([generateQrCodes(40), generateQrCodes(40), generateQrCodes(40)]);

    const all = batches.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(await QR.countDocuments()).toBe(all.length);
  });

  it("generates a single ID through the same guarantee", async () => {
    expect(await generateUniqueQrId()).toMatch(QR_ID_PATTERN);
  });
});

describe("activation", () => {
  it("claims an unassigned code and links it to the merchant", async () => {
    const [qrId] = await generateQrCodes(1);

    const { qr } = await activateQr({
      qrId,
      type: "WHATSAPP",
      destination: "919876543210",
      merchant: merchant("11"),
    });

    expect(qr.status).toBe("ACTIVE");
    expect(qr.type).toBe("WHATSAPP");
    expect(qr.merchantId).not.toBeNull();

    const stored = await findQrById(qrId);
    expect(stored?.status).toBe("ACTIVE");
    expect((stored?.merchantId as unknown as { businessName: string }).businessName).toContain("Sharma Tea");
  });

  it("lets only one of two concurrent activations win", async () => {
    const [qrId] = await generateQrCodes(1);

    const results = await Promise.allSettled([
      activateQr({ qrId, type: "WHATSAPP", destination: "919876543210", merchant: merchant("21") }),
      activateQr({ qrId, type: "INSTAGRAM", destination: "https://instagram.com/other", merchant: merchant("22") }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ApiError);
    expect(((rejected[0] as PromiseRejectedResult).reason as ApiError).code).toBe("QR_ALREADY_ACTIVE");

    const stored = await QR.findOne({ qrId }).lean();
    expect(stored?.status).toBe("ACTIVE");

    // The losing attempt must not leave a shop record behind.
    expect(await Merchant.countDocuments()).toBe(1);
  });

  it("rejects an unknown QR code without creating a merchant", async () => {
    await expect(
      activateQr({ qrId: "QRNOPE0001", type: "WHATSAPP", destination: "919876543210", merchant: merchant("31") }),
    ).rejects.toMatchObject({ code: "QR_NOT_FOUND" });

    expect(await Merchant.countDocuments()).toBe(0);
  });

  it("does not touch merchant data when the activation is refused", async () => {
    const [qrId] = await generateQrCodes(1);
    await activateQr({ qrId, type: "WHATSAPP", destination: "919876543210", merchant: merchant("41") });

    const before = await Merchant.findOne({ mobile: "919876543241" }).lean();
    expect(before?.businessName).toContain("41");

    await expect(
      activateQr({
        qrId,
        type: "INSTAGRAM",
        destination: "https://instagram.com/hijacked",
        merchant: { ...merchant("41"), businessName: "Someone Else" },
      }),
    ).rejects.toMatchObject({ code: "QR_ALREADY_ACTIVE" });

    const after = await Merchant.findOne({ mobile: "919876543241" }).lean();
    expect(after?.businessName).toBe(before?.businessName);
    expect(after?.name).toBe(before?.name);
  });

  it("reuses the merchant record when a shop activates a second card", async () => {
    const ids = await generateQrCodes(2);

    await activateQr({ qrId: ids[0]!, type: "WHATSAPP", destination: "919876543210", merchant: merchant("51") });
    await activateQr({ qrId: ids[1]!, type: "GOOGLE_REVIEW", destination: "https://g.page/x", merchant: merchant("51") });

    expect(await Merchant.countDocuments()).toBe(1);
    expect(await QR.countDocuments({ merchantId: { $exists: true } })).toBe(2);
  });
});

describe("admin edits", () => {
  it("keeps an unassigned QR offline when only its destination is edited", async () => {
    const [qrId] = await generateQrCodes(1);

    const updated = await editQr(qrId, { type: "INSTAGRAM", destination: "https://instagram.com/the_stall" });

    expect(updated.destinationUrl).toContain("instagram.com/the_stall");
    expect(updated.status).toBe("GENERATED");
  });

  it("refuses to go live before a merchant and destination exist", async () => {
    const [qrId] = await generateQrCodes(1);

    await expect(editQr(qrId, { status: "ACTIVE" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const stored = await QR.findOne({ qrId }).lean();
    expect(stored?.status).toBe("GENERATED");
  });

  it("pauses and resumes an activated QR while keeping its destination", async () => {
    const [qrId] = await generateQrCodes(1);
    await activateQr({ qrId, type: "WHATSAPP", destination: "919876543210", merchant: merchant("61") });

    const paused = await editQr(qrId, { status: "INACTIVE" });
    expect(paused.status).toBe("INACTIVE");
    expect(paused.destinationUrl).toContain("wa.me");

    const resumed = await editQr(qrId, { status: "ACTIVE" });
    expect(resumed.status).toBe("ACTIVE");
  });

  it("changes where an active QR sends people without touching the merchant", async () => {
    const [qrId] = await generateQrCodes(1);
    const { merchant: owner } = await activateQr({
      qrId,
      type: "WHATSAPP",
      destination: "919876543210",
      merchant: merchant("71"),
    });

    const updated = await editQr(qrId, { type: "GOOGLE_REVIEW", destination: "https://g.page/abc" });

    expect(updated.status).toBe("ACTIVE");
    expect(updated.destinationUrl).toContain("g.page");
    expect(String((updated.merchantId as unknown as { _id: unknown })._id)).toBe(String(owner._id));
  });

  it("moves a QR to another merchant and brings it live", async () => {
    const [qrId] = await generateQrCodes(1);
    const { merchant: owner } = await activateQr({
      qrId,
      type: "WHATSAPP",
      destination: "919876543210",
      merchant: merchant("81"),
    });
    const { merchant: other } = await activateQr({
      qrId: (await generateQrCodes(1))[0]!,
      type: "WHATSAPP",
      destination: "919876543210",
      merchant: merchant("82"),
    });

    const moved = await reassignQr({
      qrId,
      merchantId: String(other._id),
      type: "CUSTOM",
      destination: "https://example.com/new",
    });

    expect(moved.status).toBe("ACTIVE");
    expect(moved.destinationUrl).toBe("https://example.com/new");
    expect(String((moved.merchantId as unknown as { _id: unknown })._id)).toBe(String(other._id));
    expect(String((moved.merchantId as unknown as { _id: unknown })._id)).not.toBe(String(owner._id));
  });

  it("reports a missing QR code", async () => {
    await expect(editQr("QRMISSING", { status: "INACTIVE" })).rejects.toMatchObject({ code: "QR_NOT_FOUND" });
  });
});
