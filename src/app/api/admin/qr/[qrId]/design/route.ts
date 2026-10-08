import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { parseQuery } from "@/lib/request";
import { z } from "zod";
import { renderQrDesign } from "@/services/design";

export const dynamic = "force-dynamic";

const querySchema = z.object({ templateId: z.string().trim().min(1) });

/** One finished design: base artwork + this QR + printed ID. */
const handler = withErrorHandling(
  async (request: Request, ctx: RouteContext<"/api/admin/qr/[qrId]/design">): Promise<Response> => {
    await requireAdmin();
    const { qrId } = await ctx.params;
    const { templateId } = parseQuery(request, querySchema);

    const design = await renderQrDesign(templateId, qrId.toUpperCase());

    return new Response(new Uint8Array(design), {
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
      },
    });
  },
);

export const GET = handler;
