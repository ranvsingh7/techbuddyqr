import { Types } from "mongoose";
import { isDuplicateKeyError } from "@/lib/mongo-error";
import { sanitizeDestination } from "@/lib/destination";
import { ApiError } from "@/lib/api-error";
import { QR } from "@/models/QR";
import { generateQrIdCandidate } from "@/qr/generate-id";
import { deleteMerchantIfUnused, findOrCreateMerchant, refreshMerchantDetails } from "@/services/merchant";
import type { MerchantDetails } from "@/services/merchant";
import type { DestinationType, QrStatus } from "@/types";

function uniqueCandidates(count: number): string[] {
  const ids = new Set<string>();
  while (ids.size < count) ids.add(generateQrIdCandidate());
  return [...ids];
}

async function insertCandidates(candidates: string[]): Promise<string[]> {
  try {
    const docs = await QR.insertMany(
      candidates.map((qrId) => ({ qrId, status: "GENERATED" })),
      { ordered: false },
    );
    return docs.map((doc) => doc.qrId);
  } catch (error) {
    // A concurrent request took one of the IDs. The unique index is the final
    // guard; the non-duplicate documents are still inserted, so re-read them.
    if (!isDuplicateKeyError(error)) throw error;
    const landed = await QR.find({ qrId: { $in: candidates } }, { qrId: 1 }).lean();
    return landed.map((doc) => doc.qrId);
  }
}

/** Creates `count` QR IDs that are guaranteed not to already exist. */
export async function generateQrCodes(count: number): Promise<string[]> {
  const created: string[] = [];

  while (created.length < count) {
    const candidates = uniqueCandidates(count - created.length);
    const existing = await QR.find({ qrId: { $in: candidates } }, { qrId: 1 }).lean();
    const taken = new Set(existing.map((doc) => doc.qrId));

    const fresh = candidates.filter((qrId) => !taken.has(qrId));
    if (fresh.length === 0) continue;

    created.push(...(await insertCandidates(fresh)));
  }

  return created;
}

/** Dedicated helper for a single ID (see generateQrCodes for the same guarantee). */
export async function generateUniqueQrId(): Promise<string> {
  const [qrId] = await generateQrCodes(1);
  return qrId;
}

/** Which of the given IDs exist, so a print batch can be checked before rendering. */
export async function findExistingQrIds(qrIds: string[]): Promise<Set<string>> {
  if (qrIds.length === 0) return new Set();
  const docs = await QR.find({ qrId: { $in: qrIds } }, { qrId: 1 }).lean();
  return new Set(docs.map((doc) => doc.qrId));
}

/**
 * Removes QR codes in a single query.
 *
 * Nothing else is touched: merchants, templates and scan history are left in
 * place, because a shop and its printed designs outlive one card. A deleted code
 * stops redirecting because there is no longer an ACTIVE row behind its ID.
 */
export async function deleteQrCodes(qrIds: string[]): Promise<{ deleted: number }> {
  if (qrIds.length === 0) return { deleted: 0 };

  const result = await QR.deleteMany({ qrId: { $in: qrIds } });

  return { deleted: result.deletedCount ?? 0 };
}

/** Detail view: the merchant is joined in so the admin page can render it. */
export async function findQrById(qrId: string) {
  return QR.findOne({ qrId }).populate("merchantId", "name businessName mobile").lean();
}

/**
 * Claims a QR for a merchant. The status precondition makes the update atomic,
 * so two merchants activating the same physical card at the same time cannot
 * both succeed.
 *
 * The merchant row is written with `$setOnInsert`, so an existing shop is never
 * renamed by whoever happens to activate a second card; its details are only
 * refreshed once the claim has actually succeeded.
 */
export async function activateQr(params: {
  qrId: string;
  type: DestinationType;
  destination: string;
  merchant: MerchantDetails;
}) {
  const destinationUrl = sanitizeDestination(params.type, params.destination);
  if (!destinationUrl) throw new ApiError("INVALID_DESTINATION", 400);

  // Fast failure path, so an unknown or already claimed card never creates data.
  const existing = await QR.findOne({ qrId: params.qrId }, { status: 1, merchantId: 1 }).lean();
  if (!existing) throw new ApiError("QR_NOT_FOUND", 404);
  if (existing.status !== "GENERATED" || existing.merchantId) throw new ApiError("QR_ALREADY_ACTIVE", 409);

  const { merchant, created } = await findOrCreateMerchant(params.merchant);

  const qr = await QR.findOneAndUpdate(
    { qrId: params.qrId, status: "GENERATED", merchantId: null },
    {
      $set: {
        merchantId: merchant._id,
        type: params.type,
        destinationUrl,
        status: "ACTIVE",
        activatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  ).lean();

  if (!qr) {
    // Lost a race. Do not leave a shop behind that owns no QR codes at all.
    if (created) await deleteMerchantIfUnused(merchant._id);
    throw new ApiError("QR_ALREADY_ACTIVE", 409);
  }

  await refreshMerchantDetails(merchant._id, params.merchant);

  return { qr, merchant };
}

/**
 * Applies an admin edit. The destination type and value are written together
 * and the status is left alone, so editing a card that is not yet assigned can
 * never take it live. Going live requires a merchant and a destination.
 */
export async function editQr(qrId: string, changes: { type?: DestinationType; destination?: string; status?: QrStatus }) {
  const update: Record<string, unknown> = {};

  if (changes.type && changes.destination) {
    const destinationUrl = sanitizeDestination(changes.type, changes.destination);
    if (!destinationUrl) throw new ApiError("INVALID_DESTINATION", 400);
    update.type = changes.type;
    update.destinationUrl = destinationUrl;
  }

  if (changes.status) {
    if (changes.status === "ACTIVE") {
      const current = await QR.findOne({ qrId }, { merchantId: 1, destinationUrl: 1 }).lean();
      if (!current) throw new ApiError("QR_NOT_FOUND", 404);
      if (!current.merchantId || !current.destinationUrl) {
        throw new ApiError("VALIDATION_ERROR", 400, undefined, "Assign a merchant and a destination before going live");
      }
    }
    update.status = changes.status;
    if (changes.status === "ACTIVE") update.activatedAt = new Date();
  }

  if (Object.keys(update).length === 0) {
    throw new ApiError("VALIDATION_ERROR", 400, undefined, "Nothing to update");
  }

  const qr = await QR.findOneAndUpdate({ qrId }, { $set: update }, { returnDocument: "after" })
    .populate("merchantId", "name businessName mobile")
    .lean();

  if (!qr) throw new ApiError("QR_NOT_FOUND", 404);
  return qr;
}

/** Moves a QR to another merchant and optionally rewrites its destination. */
export async function reassignQr(params: {
  qrId: string;
  merchantId?: string;
  merchant?: MerchantDetails;
  type?: DestinationType;
  destination?: string;
}) {
  let merchantId = params.merchantId;

  if (!merchantId) {
    if (!params.merchant) throw new ApiError("VALIDATION_ERROR", 400);
    const { merchant } = await findOrCreateMerchant(params.merchant);
    merchantId = String(merchant._id);
  } else if (!Types.ObjectId.isValid(merchantId)) {
    throw new ApiError("VALIDATION_ERROR", 400, undefined, "Invalid merchant");
  }

  const update: Record<string, unknown> = { merchantId };

  if (params.type && params.destination) {
    const destinationUrl = sanitizeDestination(params.type, params.destination);
    if (!destinationUrl) throw new ApiError("INVALID_DESTINATION", 400);
    // A merchant plus a destination is a complete, working QR.
    update.type = params.type;
    update.destinationUrl = destinationUrl;
    update.status = "ACTIVE";
    update.activatedAt = new Date();
  }

  const qr = await QR.findOneAndUpdate({ qrId: params.qrId }, { $set: update }, { returnDocument: "after" })
    .populate("merchantId", "businessName mobile name")
    .lean();

  if (!qr) throw new ApiError("QR_NOT_FOUND", 404);
  return qr;
}
