import { ok } from "@/lib/api-response";
import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { ApiError } from "@/lib/api-error";
import { Types } from "mongoose";
import { Merchant } from "@/models/Merchant";
import { QR } from "@/models/QR";

export const dynamic = "force-dynamic";

const handler = withErrorHandling(async (_request: Request, ctx: RouteContext<"/api/admin/merchants/[id]">): Promise<Response> => {
  await requireAdmin();
  const { id } = await ctx.params;

  if (!Types.ObjectId.isValid(id)) throw new ApiError("MERCHANT_NOT_FOUND", 404);

  const merchant = await Merchant.findById(id).lean();
  if (!merchant) throw new ApiError("MERCHANT_NOT_FOUND", 404);

  const qrs = await QR.find({ merchantId: id })
    .sort({ createdAt: -1 })
    .select("qrId status type destinationUrl createdAt lastScannedAt")
    .lean();

  return ok({ merchant, qrs });
});

export const GET = handler;
