import { ok } from "@/lib/api-response";
import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { parseJsonBody } from "@/lib/request";
import { dbConnect } from "@/lib/db";
import { bulkGenerateSchema } from "@/validation/schemas";
import { generateQrCodes } from "@/services/qr";

export const dynamic = "force-dynamic";

/** Bulk generator: creates N unique QR IDs and returns them for preview. */
const handler = withErrorHandling(async (request: Request): Promise<Response> => {
  await requireAdmin();
  const { count } = await parseJsonBody(request, bulkGenerateSchema);
  await dbConnect();

  const qrIds = await generateQrCodes(count);
  return ok({ qrIds, count: qrIds.length });
});

export const POST = handler;
