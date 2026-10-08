import { ok } from "@/lib/api-response";
import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { ApiError } from "@/lib/api-error";
import { parse } from "@/lib/request";
import { createTemplateSchema } from "@/validation/schemas";
import { createTemplate, listTemplates } from "@/services/template";

export const dynamic = "force-dynamic";

const listHandler = withErrorHandling(async (): Promise<Response> => {
  await requireAdmin();
  return ok(await listTemplates());
});

export const GET = listHandler;

/** multipart/form-data: image file + name + type + both overlay layers. */
const createHandler = withErrorHandling(async (request: Request): Promise<Response> => {
  await requireAdmin();

  const form = await request.formData();
  const file = form.get("image");

  if (!(file instanceof File)) {
    throw new ApiError("VALIDATION_ERROR", 400, { image: "Choose an image file" });
  }

  const hasOverlay = ["qr.x", "qr.y", "qr.size", "text.x", "text.y", "text.fontSize"].every((field) => form.get(field) !== null);

  const input = parse(createTemplateSchema, {
    name: form.get("name"),
    type: form.get("type") || null,
    lightPlate: form.get("lightPlate") === "true",
    // Two independent layers. Older clients can still post x/y/width/height.
    overlay: hasOverlay
      ? {
          qr: {
            x: form.get("qr.x"), y: form.get("qr.y"), size: form.get("qr.size"),
            dotStyle: form.get("qr.dotStyle") ?? undefined,
            icon: form.get("qr.icon") ? JSON.parse(String(form.get("qr.icon"))) : undefined,
          },
          text: {
            x: form.get("text.x"),
            y: form.get("text.y"),
            fontSize: form.get("text.fontSize"),
            rotation: form.get("text.rotation") ?? 0,
            alignment: form.get("text.alignment") ?? "center",
          },
        }
      : undefined,
    qrPosition: hasOverlay
      ? undefined
      : { x: form.get("x"), y: form.get("y"), width: form.get("width"), height: form.get("height") },
  });

  return ok(await createTemplate(input, file), { status: 201 });
});

export const POST = createHandler;
