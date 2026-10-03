import { ok } from "@/lib/api-response";
import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { parseJsonBody } from "@/lib/request";
import { editQrSchema } from "@/validation/schemas";
import { editQr, findQrById } from "@/services/qr";
import { ApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/** Full record for the admin detail panel, merchant already joined in. */
const readHandler = withErrorHandling(
  async (_request: Request, ctx: RouteContext<"/api/admin/qr/[qrId]">): Promise<Response> => {
    await requireAdmin();
    const { qrId } = await ctx.params;

    const qr = await findQrById(qrId);
    if (!qr) throw new ApiError("QR_NOT_FOUND", 404);

    return ok(qr);
  },
);

export const GET = readHandler;

/** Rewrites where a QR sends people, or pauses it, without touching the printed card. */
const patchHandler = withErrorHandling(
  async (request: Request, ctx: RouteContext<"/api/admin/qr/[qrId]">): Promise<Response> => {
    await requireAdmin();
    const { qrId } = await ctx.params;
    const input = await parseJsonBody(request, editQrSchema);

    const qr = await editQr(qrId, input);

    return ok({ qrId: qr.qrId, type: qr.type, destinationUrl: qr.destinationUrl, status: qr.status });
  },
);

export const PATCH = patchHandler;
