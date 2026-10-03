import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { ApiError } from "@/lib/api-error";
import { storage } from "@/lib/storage";
import { getTemplate } from "@/services/template";

export const dynamic = "force-dynamic";

/** Serves the base artwork so the editor can show what the admin is designing on. */
const handler = withErrorHandling(async (_request: Request, ctx: RouteContext<"/api/admin/templates/[id]/image">): Promise<Response> => {
  await requireAdmin();
  const template = await getTemplate((await ctx.params).id);
  if (!template) throw new ApiError("TEMPLATE_NOT_FOUND", 404);

  const image = await storage.readTemplateImage(template.imageKey);
  const contentType = template.imageKey.endsWith(".webp") ? "image/webp" : template.imageKey.endsWith(".jpg") ? "image/jpeg" : "image/png";

  return new Response(new Uint8Array(image), {
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=60",
    },
  });
});

export const GET = handler;
