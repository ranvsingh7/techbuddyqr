import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { parseJsonBody } from "@/lib/request";
import { downloadDesignsSchema } from "@/validation/schemas";
import { designZipName, renderDesignZip } from "@/services/design";

export const dynamic = "force-dynamic";
/** Image composition for a batch takes longer than the default server budget. */
export const maxDuration = 60;

/** Bulk download: every design in the batch inside one ZIP. */
const handler = withErrorHandling(async (request: Request): Promise<Response> => {
  await requireAdmin();
  const { templateId, qrIds } = await parseJsonBody(request, downloadDesignsSchema);

  const zip = await renderDesignZip(templateId, qrIds);
  const fileName = designZipName("qr-batch");

  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
});

export const POST = handler;
