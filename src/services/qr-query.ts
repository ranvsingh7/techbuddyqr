import { Types } from "mongoose";
import { Merchant } from "@/models/Merchant";
import { QR } from "@/models/QR";
import { ScanEvent } from "@/models/ScanEvent";
import type { DestinationType, QrStatus } from "@/types";
import type { z } from "zod";
import type { qrListQuerySchema } from "@/validation/schemas";

export type QrListFilters = z.infer<typeof qrListQuerySchema>;
export type PopulatedMerchant = { _id: Types.ObjectId; name: string; businessName: string; mobile: string };

/** A QR row shaped for the admin UI, with the merchant already joined in. */
export type QrListItem = {
  qrId: string;
  status: QrStatus;
  type: DestinationType | null;
  destinationUrl: string | null;
  merchant: PopulatedMerchant | null;
  activatedAt: Date | null;
  lastScannedAt: Date | null;
  createdAt: Date;
};

const MERCHANT_FIELDS = "name businessName mobile";

export async function listQrCodes(filters: QrListFilters): Promise<{ items: QrListItem[]; total: number; page: number; pages: number }> {
  const query: Record<string, unknown> = {};

  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;
  if (filters.merchantId && Types.ObjectId.isValid(filters.merchantId)) query.merchantId = filters.merchantId;

  if (filters.q) {
    const keyword = filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(keyword, "i");
    const merchants = await Merchant.find({
      $or: [{ businessName: pattern }, { name: pattern }, { mobile: pattern }],
    })
      .select("_id")
      .lean();

    query.$or = [{ qrId: pattern }, { destinationUrl: pattern }, { merchantId: { $in: merchants.map((m) => m._id) } }];
  }

  // The total and the page of rows do not depend on each other, so they are one
  // round trip rather than two. `populate` adds its own merchant lookup.
  const [total, docs] = await Promise.all([
    QR.countDocuments(query),
    QR.find(query)
      .sort({ createdAt: -1 })
      .skip((filters.page - 1) * filters.limit)
      .limit(filters.limit)
      .populate("merchantId", MERCHANT_FIELDS)
      .lean(),
  ]);

  return {
    items: docs.map((doc) => ({
      qrId: doc.qrId,
      status: doc.status,
      type: doc.type,
      destinationUrl: doc.destinationUrl,
      merchant: (doc.merchantId as unknown as PopulatedMerchant | null) ?? null,
      activatedAt: doc.activatedAt,
      lastScannedAt: doc.lastScannedAt,
      createdAt: doc.createdAt!,
    })),
    total,
    page: filters.page,
    pages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

/**
 * Scan totals for a page of codes. Counting in the database avoids loading every
 * scan document just to measure them.
 */
export async function countScansByQrId(qrIds: string[]): Promise<Map<string, number>> {
  if (qrIds.length === 0) return new Map();

  const rows = await ScanEvent.aggregate<{ _id: string; count: number }>([
    { $match: { qrId: { $in: qrIds } } },
    { $group: { _id: "$qrId", count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [row._id, row.count]));
}

export async function listQrIds(filters: Pick<QrListFilters, "status" | "type"> & { limit: number }): Promise<string[]> {
  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;

  const docs = await QR.find(query).sort({ createdAt: -1 }).limit(filters.limit).select("qrId").lean();
  return docs.map((doc) => doc.qrId);
}
