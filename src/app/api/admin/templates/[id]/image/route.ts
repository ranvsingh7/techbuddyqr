import { Readable } from "node:stream";
import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { ApiError } from "@/lib/api-error";
import { streamTemplateArtwork } from "@/lib/template-image";
import { getTemplateWithImage, replaceTemplateImage } from "@/services/template";

export const dynamic = "force-dynamic";

/**
 * Serves the original artwork so the editor can show what the admin is
 * designing on.
 *
 * The file is piped straight out of GridFS rather than buffered, and the type
 * comes from the file's own metadata. Nothing about the storage layer is
 * exposed: the response is only an image.
 */
const getHandler = withErrorHandling(
  async (_request: Request, ctx: RouteContext<"/api/admin/templates/[id]/image">): Promise<Response> => {
    await requireAdmin();
    const template = await getTemplateWithImage((await ctx.params).id);

    const { stream, contentType, length } = await streamTemplateArtwork(template);
    const headers: Record<string, string> = {
      "content-type": contentType,
      // Artwork only changes when the template's image is replaced, and that
      // produces a new response from this address on every load.
      "cache-control": "private, no-cache",
    };
    if (length > 0) headers["content-length"] = String(length);

    // The read can still fail after the headers are on the wire; log it rather
    // than pretending the response is complete.
    stream.on("error", (error) => console.error("template image stream failed", error));

    return new Response(Readable.toWeb(stream) as ReadableStream, { headers });
  },
);

/** multipart/form-data with an `image` field: replaces the template's artwork. */
const replaceHandler = withErrorHandling(
  async (request: Request, ctx: RouteContext<"/api/admin/templates/[id]/image">): Promise<Response> => {
    await requireAdmin();

    const file = (await request.formData()).get("image");
    if (!(file instanceof File)) {
      throw new ApiError("VALIDATION_ERROR", 400, { image: "Choose an image file" });
    }

    const template = await replaceTemplateImage((await ctx.params).id, file);
    return Response.json({ data: template });
  },
);

export const GET = getHandler;
export const POST = replaceHandler;