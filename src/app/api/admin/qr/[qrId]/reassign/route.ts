import { ok } from "@/lib/api-response";
import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { parseJsonBody } from "@/lib/request";
import { reassignQrSchema } from "@/validation/schemas";
import { reassignQr } from "@/services/qr";

export const dynamic = "force-dynamic";

/** Moves a printed QR to a different merchant. No reprinting needed. */
const handler = withErrorHandling(
  async (request: Request, ctx: RouteContext<"/api/admin/qr/[qrId]/reassign">): Promise<Response> => {
    await requireAdmin();
    const { qrId } = await ctx.params;
    const input = await parseJsonBody(request, reassignQrSchema);

    const qr = await reassignQr({
      qrId,
      merchantId: input.merchantId,
      merchant: input.mobile && input.ownerName && input.businessName
        ? { mobile: input.mobile, ownerName: input.ownerName, businessName: input.businessName }
        : undefined,
      type: input.type,
      destination: input.destination,
    });

    return ok({ qrId: qr.qrId, status: qr.status, destinationUrl: qr.destinationUrl, type: qr.type });
  },
);

export const POST = handler;
