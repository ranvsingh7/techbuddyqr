import { createHash } from "node:crypto";
import { env } from "@/lib/env";

/**
 * One-way hash of the client IP, salted with AUTH_SECRET. Lets us detect repeat
 * scans from the same visitor without storing anything that identifies them.
 */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${env().authSecret}:${ip}`).digest("hex").slice(0, 32);
}
