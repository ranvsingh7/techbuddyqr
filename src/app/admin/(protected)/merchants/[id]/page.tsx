import Link from "next/link";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { findMerchantById } from "@/services/merchant";
import { listQrCodes } from "@/services/qr-query";
import { DESTINATION_CONFIG } from "@/types";
import { Card, CardHeader, EmptyState, MonoId, StatusBadge, buttonClass } from "@/components/ui";
import { dbConnect } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Merchant" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminMerchantPage({ params }: PageProps<"/admin/merchants/[id]">) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await dbConnect();
  const merchant = await findMerchantById(id);
  if (!merchant) notFound();

  const { items } = await listQrCodes({ merchantId: id, page: 1, limit: 200 });

  return (
    <div className="space-y-5">
      <header>
        <Link href="/admin/merchants" className={buttonClass.link}>
          ← All merchants
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{merchant.businessName}</h1>
        <p className="mt-0.5 text-sm text-muted">
          {merchant.name} · {merchant.mobile} · joined {dateFormat.format(new Date(merchant.createdAt!))}
        </p>
      </header>

      <Card>
        <CardHeader
          title="Assigned QR codes"
          description="Destinations can be changed at any time without reprinting the card."
          action={
            <Link href={`/admin/qr?q=${encodeURIComponent(merchant.businessName)}`} className={buttonClass.secondary}>
              Search in QR management
            </Link>
          }
        />

        {items.length === 0 ? (
          <EmptyState title="No QR codes yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">QR ID</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Destination</th>
                  <th className="px-4 py-3 font-medium">Last scan</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((item) => (
                  <tr key={item.qrId} className="hover:bg-canvas">
                    <td className="px-4 py-3">
                      <Link href={`/admin/qr/${item.qrId}`} className="hover:underline">
                        <MonoId value={item.qrId} />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{item.type ? DESTINATION_CONFIG[item.type].label : "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="max-w-72 truncate px-4 py-3 text-muted" title={item.destinationUrl ?? undefined}>
                      {item.destinationUrl ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {item.lastScannedAt ? dateTimeFormat.format(new Date(item.lastScannedAt)) : "Never"}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{dateFormat.format(new Date(item.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
