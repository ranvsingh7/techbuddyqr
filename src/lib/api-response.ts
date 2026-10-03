import type { ApiOkBody } from "@/lib/api-error";

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data } satisfies ApiOkBody<T>, init);
}
