import { Types } from "mongoose";
import { Merchant } from "@/models/Merchant";
import { QR } from "@/models/QR";

export type MerchantListItem = {
  _id: Types.ObjectId;
  name: string;
  businessName: string;
  mobile: string;
  qrCount: number;
  createdAt: Date;
};

export type MerchantFilters = { q?: string; page: number; limit: number };

/** Lists merchants with their QR counts computed in a single aggregation. */
export async function listMerchants(filters: MerchantFilters): Promise<{
  items: MerchantListItem[];
  total: number;
  page: number;
  pages: number;
}> {
  const match: Record<string, unknown> = {};
  if (filters.q) {
    const pattern = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    match.$or = [{ businessName: pattern }, { name: pattern }, { mobile: pattern }];
  }

  const [result] = await Merchant.aggregate<{ _id: Types.ObjectId; docs: MerchantListItem[]; total: number }>([
    { $match: match },
    {
      $lookup: {
        from: QR.collection.name,
        localField: "_id",
        foreignField: "merchantId",
        as: "qrs",
      },
    },
    {
      $facet: {
        docs: [
          { $sort: { createdAt: -1 } },
          { $skip: (filters.page - 1) * filters.limit },
          { $limit: filters.limit },
          {
            $project: {
              name: 1,
              businessName: 1,
              mobile: 1,
              createdAt: 1,
              qrCount: { $size: "$qrs" },
            },
          },
        ],
        total: [{ $count: "value" }],
      },
    },
    { $project: { docs: 1, total: { $ifNull: [{ $first: "$total.value" }, 0] } } },
  ]);

  const total = result?.total ?? 0;
  return {
    items: (result?.docs ?? []).map((doc) => ({ ...doc, createdAt: doc.createdAt ?? new Date(0) })),
    total,
    page: filters.page,
    pages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

export async function getMerchantQrIds(merchantId: string): Promise<string[]> {
  if (!Types.ObjectId.isValid(merchantId)) return [];

  const docs = await QR.find({ merchantId }).sort({ createdAt: -1 }).select("qrId").lean();
  return docs.map((doc) => doc.qrId);
}
