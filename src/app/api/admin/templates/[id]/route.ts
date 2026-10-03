import { ok } from "@/lib/api-response";
import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { parseJsonBody } from "@/lib/request";
import { updateTemplateSchema } from "@/validation/schemas";
import { deleteTemplate, getTemplate, updateTemplate } from "@/services/template";

export const dynamic = "force-dynamic";

const readHandler = withErrorHandling(async (_request: Request, ctx: RouteContext<"/api/admin/templates/[id]">): Promise<Response> => {
  await requireAdmin();
  return ok(await getTemplate((await ctx.params).id));
});

export const GET = readHandler;

const patchHandler = withErrorHandling(async (request: Request, ctx: RouteContext<"/api/admin/templates/[id]">): Promise<Response> => {
  await requireAdmin();
  const { id } = await ctx.params;
  return ok(await updateTemplate(id, await parseJsonBody(request, updateTemplateSchema)));
});

export const PATCH = patchHandler;

const deleteHandler = withErrorHandling(async (_request: Request, ctx: RouteContext<"/api/admin/templates/[id]">): Promise<Response> => {
  await requireAdmin();
  await deleteTemplate((await ctx.params).id);
  return ok({ deleted: true });
});

export const DELETE = deleteHandler;
