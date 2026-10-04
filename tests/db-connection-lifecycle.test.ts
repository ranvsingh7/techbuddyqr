import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dbConnect } from "@/lib/db";
import { Merchant } from "@/models/Merchant";
import { QR } from "@/models/QR";

/**
 * The production failure was React rendering a layout and its page
 * concurrently: the layout called `dbConnect()` while the page's query ran
 * against a socket that did not exist yet. With `bufferCommands: false` that
 * surfaced as React #441, and with buffering enabled it surfaced ten seconds
 * later as "buffering timed out after 10000ms".
 *
 * These tests pin the two invariants that stop it: exactly one `connect()` per
 * instance, and every querying admin page awaiting the connection itself.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_PAGES = path.join(ROOT, "src/app/admin/(protected)");

function adminPages(dir: string = ADMIN_PAGES): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return adminPages(full);
    return entry === "page.tsx" ? [full] : [];
  });
}

/** True when the file runs a query, directly or through a service call. */
function queriesDatabase(source: string): boolean {
  return /\.(find|findOne|findById|countDocuments|aggregate|create|insertMany|updateOne|updateMany|deleteOne|deleteMany)\(/.test(source)
    || /\b(listQrCodes|listMerchants|listTemplates|getTemplate|findQrById|findMerchantById|loadStats|generateQrCodes)\b/.test(source);
}

afterAll(async () => {
  await mongoose.disconnect();
});

describe("dbConnect lifecycle", () => {
  it("collapses concurrent cold-start callers into a single connect()", async () => {
    await mongoose.disconnect();
    expect(mongoose.connection.readyState).not.toBe(1);

    const spy = vi.spyOn(mongoose, "connect");
    try {
      // React renders the layout and the page at the same time, and Fluid
      // Compute serves several requests per instance, so these genuinely race.
      const results = await Promise.all([dbConnect(), dbConnect(), dbConnect(), dbConnect(), dbConnect(), dbConnect()]);

      expect(results).toHaveLength(6);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(mongoose.connection.readyState).toBe(1);
      for (const result of results) expect(result).toBe(mongoose);
    } finally {
      spy.mockRestore();
    }
  });

  it("reconnects instead of handing back a cached connection whose socket closed", async () => {
    await dbConnect();
    expect(mongoose.connection.readyState).toBe(1);

    // Atlas and any NAT in front of it close idle sockets. A warm instance that
    // is handed its stale cached mongoose object here would buffer every query
    // until the 10s timeout instead of reconnecting.
    const spy = vi.spyOn(mongoose, "connect");
    try {
      await mongoose.disconnect();
      expect(mongoose.connection.readyState).not.toBe(1);

      await dbConnect();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(mongoose.connection.readyState).toBe(1);
      expect(await Merchant.estimatedDocumentCount()).toBeGreaterThanOrEqual(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("clears the cache after a failed attempt so the next caller can connect", async () => {
    await mongoose.disconnect();

    const spy = vi.spyOn(mongoose, "connect");
    spy.mockRejectedValueOnce(new Error("simulated connection failure") as never);

    await expect(dbConnect()).rejects.toThrow("simulated connection failure");
    // A rejected attempt must not stay cached, or every later request would
    // await a promise that can only ever reject again.
    spy.mockRestore();

    await expect(dbConnect()).resolves.toBe(mongoose);
    expect(mongoose.connection.readyState).toBe(1);
  });
});

describe("admin pages connect before they query", () => {
  it("discovers Server Component pages", () => {
    expect(adminPages().length).toBeGreaterThan(0);
  });

  for (const file of adminPages()) {
    const name = path.relative(ADMIN_PAGES, file);
    it(`awaits dbConnect() before querying in ${name}`, () => {
      const source = readFileSync(file, "utf8");
      if (!queriesDatabase(source)) return;

      expect(source.match(/await dbConnect\(\)/g)?.length ?? 0).toBeGreaterThan(0);
    });
  }
});

describe("service layer is safe behind an already-connected page", () => {
  beforeAll(async () => {
    await dbConnect();
    await QR.deleteMany({});
    await Merchant.deleteMany({});
  });

  it("runs the merchants aggregation that failed in production", async () => {
    await Merchant.create({ name: "Test Shop", businessName: "Test Shop", mobile: "+919000000000" });

    const [result] = await Merchant.aggregate<{ value: number }>([{ $count: "value" }]);

    expect(result).toEqual({ value: 1 });
  });
});