import type { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { formatZodError } from "@/validation/schemas";

export function parse<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError("VALIDATION_ERROR", 400, formatZodError(result.error));
  return result.data;
}

export async function parseJsonBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", 400, { form: "Invalid request body" });
  }
  return parse(schema, raw);
}

export function parseQuery<S extends z.ZodType>(request: Request, schema: S): z.infer<S> {
  return parse(schema, Object.fromEntries(new URL(request.url).searchParams));
}
