import { ok } from "@/lib/api-response";
import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { parse, parseJsonBody } from "@/lib/request";
import { adminActivateQrSchema, qrIdSchema } from "@/validation/schemas";
import { activateQr } from "@/services/qr";

export const dynamic = "force-dynamic";

/** Lets an admin claim a QR on a merchant's behalf. */
const handler = withErrorHandling(
  async (request: Request, ctx: RouteContext<"/api/admin/qr/[qrId]/activate">): Promise<Response> => {
    await requireAdmin();
    const { qrId } = await ctx.params;
    const { type, destination, merchant } = await parseJsonBody(request, adminActivateQrSchema);

    const result = await activateQr({ qrId: parse(qrIdSchema, qrId), type, destination, merchant });

    return ok({ qrId: result.qr.qrId, status: result.qr.status, businessName: result.merchant.businessName });
  },
);

export const POST = handler;
