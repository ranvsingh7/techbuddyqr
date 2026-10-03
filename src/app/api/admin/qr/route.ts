import { ok } from "@/lib/api-response";
import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { parseJsonBody, parseQuery } from "@/lib/request";
import { deleteQrCodesSchema, qrListQuerySchema } from "@/validation/schemas";
import { listQrCodes } from "@/services/qr-query";
import { deleteQrCodes } from "@/services/qr";

export const dynamic = "force-dynamic";

const handler = withErrorHandling(async (request: Request): Promise<Response> => {
  await requireAdmin();
  return ok(await listQrCodes(parseQuery(request, qrListQuerySchema)));
});

export const GET = handler;

/** Bulk delete: removes exactly the requested codes, and nothing else. */
const deleteHandler = withErrorHandling(async (request: Request): Promise<Response> => {
  await requireAdmin();
  const { qrIds } = await parseJsonBody(request, deleteQrCodesSchema);

  return ok(await deleteQrCodes(qrIds));
});

export const DELETE = deleteHandler;
