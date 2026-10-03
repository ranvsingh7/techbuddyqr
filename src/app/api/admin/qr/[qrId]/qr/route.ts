import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { renderQrPng } from "@/qr/render";

export const dynamic = "force-dynamic";

/** Plain QR symbol for a single ID, used in the admin table. */
const handler = withErrorHandling(async (_request: Request, ctx: RouteContext<"/api/admin/qr/[qrId]/qr">): Promise<Response> => {
  await requireAdmin();
  const { qrId } = await ctx.params;

  const png = await renderQrPng(qrId.toUpperCase(), 360);

  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=300",
    },
  });
});

export const GET = handler;
