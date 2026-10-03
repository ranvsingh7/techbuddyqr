import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connectTestDatabase, disconnectTestDatabase } from "./helpers/database";
import { requestWithIp } from "./helpers/request-scope";
import { hashPassword, verifyPassword } from "@/auth/password";
import { SESSION_COOKIE, getSession } from "@/auth/session";
import { POST as login } from "@/app/api/admin/login/route";
import { POST as logout } from "@/app/api/admin/logout/route";

const cookies = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookies.has(name) ? { name, value: cookies.get(name) } : undefined),
    set: (name: string, value: string) => void cookies.set(name, value),
    delete: (name: string) => void cookies.delete(name),
  }),
}));

const credentials = { email: "admin@example.com", password: "a-long-enough-password" };
const loginRequest = (password = credentials.password, email = credentials.email) =>
  login(
    requestWithIp("203.0.113.9", "/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );

beforeAll(async () => {
  // The admin account comes from the environment, so the test owns it too.
  process.env.ADMIN_EMAIL = "admin@example.com";
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(credentials.password);
});

beforeEach(async () => {
  await connectTestDatabase();
  cookies.clear();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

describe("password hashing", () => {
  it("produces a hash that verifies", async () => {
    const hash = await hashPassword(credentials.password);

    expect(await verifyPassword(credentials.password, hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("never emits `$`, which .env files would expand away", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(await hashPassword(credentials.password)).not.toContain("$");
    }
  });

  it("still reads hashes written with `$` separators", async () => {
    const [scheme, salt, hash] = (await hashPassword(credentials.password)).split(".");

    expect(await verifyPassword(credentials.password, [scheme, salt, hash].join("$"))).toBe(true);
  });

  it("uses a fresh salt every time", async () => {
    const first = await hashPassword(credentials.password);
    const second = await hashPassword(credentials.password);

    expect(first).not.toBe(second);
  });

  it("refuses a malformed stored hash", async () => {
    expect(await verifyPassword(credentials.password, "not-a-hash")).toBe(false);
    expect(await verifyPassword(credentials.password, "")).toBe(false);
    expect(await verifyPassword(credentials.password, "scrypt.only-two-parts")).toBe(false);
  });
});

describe("admin login", () => {
  it("issues a session for the right password", async () => {
    const response = await loginRequest();

    expect(response.status).toBe(200);
    expect(cookies.get(SESSION_COOKIE)).toBeTruthy();
    expect(await getSession()).toEqual({ email: credentials.email });
  });

  it("signs the session so a tampered cookie is ignored", async () => {
    await loginRequest();
    const token = cookies.get(SESSION_COOKIE)!;

    expect(await getSession()).not.toBeNull();

    const [header, payload] = token.split(".").slice(0, 2).map((part) => JSON.parse(Buffer.from(part, "base64url").toString()));
    expect(header.alg).toBe("HS256");
    expect(payload.email).toBe(credentials.email);
    expect(payload.exp).toBeGreaterThan(payload.iat);

    cookies.set(SESSION_COOKIE, `${token.slice(0, -2)}xy`);
    expect(await getSession()).toBeNull();
  });

  it("refuses a wrong password without issuing a cookie", async () => {
    const response = await loginRequest("definitely-not-it");

    expect(response.status).toBe(401);
    const { error } = (await response.json()) as { error: { code: string } };
    expect(error.code).toBe("INVALID_CREDENTIALS");
    expect(await getSession()).toBeNull();
  });

  it("refuses an unknown email the same way", async () => {
    const response = await loginRequest(credentials.password, "someone@example.com");

    expect(response.status).toBe(401);
    expect((await response.json()).toString()).not.toContain("ADMIN_EMAIL");
  });

  it("rejects a malformed request", async () => {
    const response = await login(
      requestWithIp("203.0.113.9", "/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", password: "x" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("clears the session on logout", async () => {
    await loginRequest();
    expect(await getSession()).not.toBeNull();

    const response = await logout();

    expect(response.status).toBe(200);
    expect(await getSession()).toBeNull();
  });
});
