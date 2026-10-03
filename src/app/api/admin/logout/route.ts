import { clearSession } from "@/auth/session";
import { ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  await clearSession();
  return ok({ signedOut: true });
}
