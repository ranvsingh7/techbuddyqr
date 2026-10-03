import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ok } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { withErrorHandling } from "@/lib/api-guard";
import { parseJsonBody } from "@/lib/request";
import { dbConnect } from "@/lib/db";
import { activateQrSchema } from "@/validation/schemas";
import { activateQr } from "@/services/qr";

const ACTIVATION_LIMIT = 10;
const ACTIVATION_WINDOW_MS = 10 * 60_000;

export const dynamic = "force-dynamic";

/** Public self-service endpoint used by the /activate page. */
const handler = withErrorHandling(async (request: Request): Promise<Response> => {
  if (!rateLimit(`activate:${clientIp(request)}`, ACTIVATION_LIMIT, ACTIVATION_WINDOW_MS).allowed) {
    throw new ApiError("RATE_LIMITED", 429);
  }

  const input = await parseJsonBody(request, activateQrSchema);
  await dbConnect();

  const { qr, merchant } = await activateQr({
    qrId: input.qrId,
    type: input.type,
    destination: input.destination,
    merchant: { mobile: input.mobile, ownerName: input.ownerName, businessName: input.businessName },
  });

  return ok({
    qrId: qr.qrId,
    businessName: merchant.businessName,
    type: qr.type,
    destinationUrl: qr.destinationUrl,
    status: qr.status,
  });
});

export const POST = handler;
