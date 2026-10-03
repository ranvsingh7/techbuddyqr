import { API_ERRORS, ApiError } from "@/lib/api-error";
import { getSession, type AdminSession } from "@/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { dbConnect } from "@/lib/db";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 5 * 60_000;

/**
 * Guards every `/api/admin/*` handler. Connecting here means an admin API call
 * is always safe as the first request of a cold process.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getSession();
  if (!session) throw new ApiError("UNAUTHORIZED", 401);
  await dbConnect();
  return session;
}

export function assertLoginAllowed(request: Request): void {
  const result = rateLimit(`login:${clientIp(request)}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!result.allowed) throw new ApiError("RATE_LIMITED", 429);
}

/** Wraps a route handler so thrown ApiErrors become consistent JSON responses. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (thrown) {
      if (thrown instanceof ApiError) {
        return Response.json(
          { error: { code: thrown.code, message: thrown.message, ...(thrown.details ? { details: thrown.details } : {}) } },
          { status: thrown.status },
        );
      }
      console.error("unhandled route error", thrown);
      return Response.json(
        { error: { code: "INTERNAL_ERROR", message: API_ERRORS.INTERNAL_ERROR } },
        { status: 500 },
      );
    }
  };
}
