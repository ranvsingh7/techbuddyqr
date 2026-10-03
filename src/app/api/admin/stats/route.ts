import { ok } from "@/lib/api-response";
import { requireAdmin, withErrorHandling } from "@/lib/api-guard";
import { QR } from "@/models/QR";
import { Merchant } from "@/models/Merchant";
import { ScanEvent } from "@/models/ScanEvent";

export const dynamic = "force-dynamic";

/** Headline numbers for the dashboard. */
const handler = withErrorHandling(async (): Promise<Response> => {
  await requireAdmin();

  const [totalQr, activeQr, unassignedQr, totalMerchants, totalScans, scansByDay] = await Promise.all([
    QR.countDocuments({}),
    QR.countDocuments({ status: "ACTIVE" }),
    QR.countDocuments({ merchantId: null }),
    Merchant.countDocuments({}),
    ScanEvent.countDocuments({}),
    ScanEvent.aggregate<{ _id: string; count: number }>([
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return ok({
    totalQr,
    activeQr,
    unassignedQr,
    totalMerchants,
    totalScans,
    scansByDay: scansByDay.map((row) => ({ date: row._id, count: row.count })),
  });
});

export const GET = handler;
