import { ok } from "@/lib/api-response";
import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { parseQuery } from "@/lib/request";
import { z } from "zod";
import { listMerchants } from "@/services/merchant-query";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

const handler = withErrorHandling(async (request: Request): Promise<Response> => {
  await requireAdmin();
  return ok(await listMerchants(parseQuery(request, querySchema)));
});

export const GET = handler;
