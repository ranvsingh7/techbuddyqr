import { assertLoginAllowed, withErrorHandling } from "@/lib/api-guard";
import { authenticateAdmin } from "@/auth/admin";
import { issueSession } from "@/auth/session";
import { ok } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { parseJsonBody } from "@/lib/request";
import { loginSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

const handler = withErrorHandling(async (request: Request): Promise<Response> => {
  assertLoginAllowed(request);

  const { email, password } = await parseJsonBody(request, loginSchema);
  if (!(await authenticateAdmin(email, password))) {
    throw new ApiError("INVALID_CREDENTIALS", 401);
  }

  await issueSession(email);
  return ok({ email });
});

export const POST = handler;
