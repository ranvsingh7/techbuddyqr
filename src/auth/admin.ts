import { env } from "@/lib/env";
import { verifyPassword } from "@/auth/password";

/** Single admin account for v1, configured through environment variables. */
export async function authenticateAdmin(email: string, password: string): Promise<boolean> {
  const config = env();
  if (email.toLowerCase() !== config.adminEmail) {
    // Still spend a hash verification so timing does not reveal a valid email.
    await verifyPassword(password, config.adminPasswordHash);
    return false;
  }
  return verifyPassword(password, config.adminPasswordHash);
}
