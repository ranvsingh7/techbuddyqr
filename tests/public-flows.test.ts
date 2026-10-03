import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connectTestDatabase, disconnectTestDatabase, resetTestDatabase } from "./helpers/database";
import { requestWithIp, withRequestScope } from "./helpers/request-scope";
import { activateQr, deleteQrCodes, generateQrCodes } from "@/services/qr";
import { QR } from "@/models/QR";
import { ScanEvent } from "@/models/ScanEvent";
import { POST as activateHandler } from "@/app/api/merchant/activate/route";
import { GET as scanHandler } from "@/app/q/[qrId]/route";

type ScanContext = RouteContext<"/q/[qrId]">;

const ctx = (qrId: string) => ({ params: Promise.resolve({ qrId }) }) as ScanContext;

const activeQr = async (destination = "https://example.com/menu") => {
  const [qrId] = await generateQrCodes(1);
  await activateQr({
    qrId,
    type: "CUSTOM",
    destination,
    merchant: { mobile: "919876543210", ownerName: "Asha Rao", businessName: "Corner Shop" },
  });
  return qrId;
};

beforeEach(async () => {
  await connectTestDatabase();
  await resetTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe("public scan endpoint", () => {
  it("redirects an active code to its stored destination", async () => {
    const qrId = await activeQr("https://example.com/today");

    const { result, deferred } = await withRequestScope(() => scanHandler(requestWithIp("1.1.1.1"), ctx(qrId)));

    expect(result.status).toBe(302);
    expect(result.headers.get("location")).toBe("https://example.com/today");
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");

    // Analytics are written after the response, never in front of it.
    expect(await ScanEvent.countDocuments()).toBe(0);
    await Promise.all(deferred.map((task) => task()));
    expect(await ScanEvent.countDocuments()).toBe(1);
    expect((await QR.findOne({ qrId }).lean())?.lastScannedAt).toBeInstanceOf(Date);
  });

  it("matches the printed ID regardless of case", async () => {
    const qrId = await activeQr("https://example.com/case");
    const { result } = await withRequestScope(() => scanHandler(requestWithIp("2.2.2.2"), ctx(qrId.toLowerCase())));

    expect(result.status).toBe(302);
    expect(result.headers.get("location")).toBe("https://example.com/case");
  });

  it("follows a changed destination without touching the QR code", async () => {
    const qrId = await activeQr("https://example.com/old");
    await QR.updateOne({ qrId }, { $set: { destinationUrl: "https://example.com/new" } });

    const { result } = await withRequestScope(() => scanHandler(requestWithIp("3.3.3.3"), ctx(qrId)));

    expect(result.headers.get("location")).toBe("https://example.com/new");
  });

  it("stops redirecting once the code is deleted", async () => {
    const qrId = await activeQr("https://example.com/gone");
    const { result: before, deferred: first } = await withRequestScope(() => scanHandler(requestWithIp("4.4.4.1"), ctx(qrId)));
    expect(before.status).toBe(302);
    await Promise.all(first.map((task) => task()));

    await deleteQrCodes([qrId]);

    // Same link, same shop: there is no longer a record behind the ID.
    const { result: after, deferred: second } = await withRequestScope(() => scanHandler(requestWithIp("4.4.4.2"), ctx(qrId)));
    expect(after.status).toBe(404);
    expect(await after.text()).toContain("not active");
    await Promise.all(second.map((task) => task()));

    // Only the scan from before the deletion was ever recorded.
    expect(await ScanEvent.countDocuments()).toBe(1);
  });

  it("shows a plain 404 page for unknown, unassigned and paused codes", async () => {
    const [unassigned] = await generateQrCodes(1);
    const active = await activeQr();
    await QR.updateOne({ qrId: active }, { $set: { status: "INACTIVE" } });

    for (const qrId of ["QRUNKNOWN1", unassigned!, active]) {
      const { result, deferred } = await withRequestScope(() => scanHandler(requestWithIp("4.4.4.4"), ctx(qrId)));

      expect(result.status).toBe(404);
      expect(result.headers.get("content-type")).toContain("text/html");
      expect(result.headers.get("cache-control")).toContain("no-store");
      expect(await result.text()).toContain("not active");
      await Promise.all(deferred.map((task) => task()));
    }

    expect(await ScanEvent.countDocuments()).toBe(0);
  });

  it("does not record a scan for a paused code", async () => {
    const qrId = await activeQr();
    await QR.updateOne({ qrId }, { $set: { status: "INACTIVE" } });

    const { result } = await withRequestScope(() => scanHandler(requestWithIp("5.5.5.5"), ctx(qrId)));

    expect(result.status).toBe(404);
    expect((await QR.findOne({ qrId }).lean())?.lastScannedAt).toBeNull();
  });
});

describe("public activation endpoint", () => {
  const body = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      qrId: "QRPLACEH01",
      type: "WHATSAPP",
      destination: "+91 98765 43210",
      mobile: "+91 98765 43210",
      ownerName: "Asha Rao",
      businessName: "Corner Shop",
      ...overrides,
    });

  const post = (payload: string, ip = "6.6.6.6") =>
    activateHandler(
      requestWithIp(ip, "/api/merchant/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      }),
    );

  it("activates a code and stores a normalised destination and mobile", async () => {
    const [qrId] = await generateQrCodes(1);

    const response = await post(body({ qrId }));
    expect(response.status).toBe(200);

    const { data } = (await response.json()) as { data: { destinationUrl: string; status: string; businessName: string } };
    expect(data.status).toBe("ACTIVE");
    expect(data.destinationUrl).toBe("https://wa.me/919876543210");
    expect(data.businessName).toBe("Corner Shop");

    const stored = await QR.findOne({ qrId }).lean();
    expect(stored?.destinationUrl).toBe("https://wa.me/919876543210");
  });

  it("reports a missing code as not found", async () => {
    const response = await post(body({ qrId: "QRMISSING" }));

    expect(response.status).toBe(404);
    const { error } = (await response.json()) as { error: { code: string } };
    expect(error.code).toBe("QR_NOT_FOUND");
  });

  it("reports an already activated code as a conflict", async () => {
    const qrId = await activeQr();

    const response = await post(body({ qrId }));

    expect(response.status).toBe(409);
    const { error } = (await response.json()) as { error: { code: string } };
    expect(error.code).toBe("QR_ALREADY_ACTIVE");
  });

  it("rejects an unsafe destination instead of storing it", async () => {
    const [qrId] = await generateQrCodes(1);

    const response = await post(body({ qrId, type: "CUSTOM", destination: "javascript:alert(1)" }));

    expect(response.status).toBe(400);
    expect((await QR.findOne({ qrId }).lean())?.status).toBe("GENERATED");
  });

  it("rejects a bad payload with field level messages", async () => {
    const response = await post(body({ mobile: "123", businessName: "x" }));

    expect(response.status).toBe(400);
    const { error } = (await response.json()) as { error: { code: string; details: Record<string, string> } };
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details.mobile).toBeTruthy();
    expect(error.details.businessName).toBeTruthy();
  });

  it("rate limits a single source", async () => {
    const ip = "7.7.7.7";
    const responses = [];

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const [qrId] = await generateQrCodes(1);
      responses.push(await post(body({ qrId }), ip));
    }

    expect(responses.filter((response) => response.status === 200)).toHaveLength(10);
    expect(responses.at(-1)?.status).toBe(429);
  });
});
