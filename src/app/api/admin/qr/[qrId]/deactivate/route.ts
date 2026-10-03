import { ok } from "@/lib/api-response";
import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { parse } from "@/lib/request";
import { qrIdSchema } from "@/validation/schemas";
import { editQr } from "@/services/qr";

export const dynamic = "force-dynamic";

/** Pauses a QR. It keeps its merchant and destination but stops redirecting. */
const handler = withErrorHandling(
  async (_request: Request, ctx: RouteContext<"/api/admin/qr/[qrId]/deactivate">): Promise<Response> => {
    await requireAdmin();
    const { qrId } = await ctx.params;

    const qr = await editQr(parse(qrIdSchema, qrId), { status: "INACTIVE" });
    return ok({ qrId: qr.qrId, status: qr.status });
  },
);

export const POST = handler;
