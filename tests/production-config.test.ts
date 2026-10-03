import path from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPORARY_STORAGE_DIR, resolveStorageDir } from "@/lib/env";
import robots from "@/app/robots";
import nextConfig from "../next.config";

/**
 * Production-readiness guards. These assert deployment behaviour that only shows
 * up on Vercel, where the filesystem is read-only and every response passes
 * through the headers configured in next.config.ts.
 */
describe("storage directory on a serverless deployment", () => {
  it("falls back to the writable temp directory when the deployment is read-only", () => {
    expect(resolveStorageDir({ VERCEL: "1" })).toBe(TEMPORARY_STORAGE_DIR);
    expect(resolveStorageDir({ AWS_LAMBDA_FUNCTION_NAME: "vercel-hydrator" })).toBe(TEMPORARY_STORAGE_DIR);
  });

  it("keeps ./storage for local development", () => {
    expect(resolveStorageDir({})).toBe(path.resolve(process.cwd(), "./storage"));
  });

  it("always honours an explicit STORAGE_DIR, so a mounted volume still works", () => {
    expect(resolveStorageDir({ STORAGE_DIR: "./storage" })).toBe(path.resolve(process.cwd(), "./storage"));
    expect(resolveStorageDir({ STORAGE_DIR: "  ./artwork  " })).toBe(path.resolve(process.cwd(), "./artwork"));
    expect(resolveStorageDir({ STORAGE_DIR: "/mnt/shared/artwork", VERCEL: "1" })).toBe("/mnt/shared/artwork");
  });

  it("never returns a path inside the read-only project folder on Vercel", () => {
    expect(resolveStorageDir({ VERCEL: "1" }).startsWith(process.cwd())).toBe(false);
  });
});

describe("robots.txt", () => {
  /** `MetadataRoute.Robots` types `rules` as a single rule or an array of them. */
  const rules = (): { allow?: string | string[]; disallow?: string | string[] }[] => {
    const value: unknown = robots().rules;
    return (Array.isArray(value) ? value : [value]) as { allow?: string | string[]; disallow?: string | string[] }[];
  };

  it("keeps admin screens, the API and scan URLs out of search results", () => {
    const disallow = rules().flatMap((rule) => rule.disallow ?? []);
    expect(disallow).toEqual(expect.arrayContaining(["/admin", "/api", "/q"]));
  });

  it("leaves the public activation page crawlable", () => {
    for (const rule of rules()) {
      expect(rule.allow ?? []).not.toContain("/activate");
      expect(rule.disallow ?? []).not.toContain("/");
    }
  });
});

describe("security headers", () => {
  const valueFor = async (source: string, key: string): Promise<string | undefined> => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const matches = rules.filter((rule) => rule.source === source).flatMap((rule) => rule.headers ?? []);
    // Later rules override earlier ones for the same key.
    return matches.filter((header) => header.key === key).at(-1)?.value;
  };

  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("sets the baseline hardening headers on every route", async () => {
    await expect(valueFor("/:path*", "X-Content-Type-Options")).resolves.toBe("nosniff");
    await expect(valueFor("/:path*", "X-Frame-Options")).resolves.toBe("DENY");
    await expect(valueFor("/:path*", "Strict-Transport-Security")).resolves.toContain("max-age=");
  });

  it("keeps the camera usable for the QR scanner on /activate", async () => {
    const policy = await valueFor("/:path*", "Permissions-Policy");
    expect(policy).toContain("camera=(self)");
    expect(policy).not.toContain("camera=()");
  });

  it("never leaks a scanned card id through the referrer", async () => {
    await expect(valueFor("/:path*", "Referrer-Policy")).resolves.toBe("strict-origin-when-cross-origin");
    await expect(valueFor("/q/:path*", "Referrer-Policy")).resolves.toBe("no-referrer");
  });
});
