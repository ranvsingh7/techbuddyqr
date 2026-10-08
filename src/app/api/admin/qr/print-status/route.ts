import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { ok } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request";
import { QR } from "@/models/QR";
import { updatePrintStatusSchema } from "@/validation/schemas";

export const dynamic = "force-dynamic";

const handler = withErrorHandling(async (request: Request): Promise<Response> => {
  await requireAdmin();
  const { qrIds, printStatus } = await parseJsonBody(request, updatePrintStatusSchema);
  const result = await QR.updateMany({ qrId: { $in: [...new Set(qrIds)] } }, { $set: { printStatus } }, { timestamps: false });
  return ok({ updated: result.modifiedCount });
});

export const PATCH = handler;