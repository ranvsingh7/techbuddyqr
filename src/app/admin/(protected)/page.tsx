import { QR } from "@/models/QR";
import { Merchant } from "@/models/Merchant";
import { ScanEvent } from "@/models/ScanEvent";
import Link from "next/link";
import { Card, CardHeader, buttonClass } from "@/components/ui";
import { qrRedirectUrl } from "@/lib/env";
import { dbConnect } from "@/lib/db";

const numberFormat = new Intl.NumberFormat("en-IN");

async function loadStats() {
  // Independent of each other, so they share one round trip instead of three:
  // on a remote database each extra hop costs a full network round trip.
  const [totalQr, activeQr, unassignedQr, totalMerchants, totalScans, topScanned, daily] = await Promise.all([
    QR.countDocuments({}),
    QR.countDocuments({ status: "ACTIVE" }),
    QR.countDocuments({ merchantId: null }),
    Merchant.countDocuments({}),
    ScanEvent.countDocuments({}),
    ScanEvent.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$qrId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    ScanEvent.aggregate<{ _id: string; count: number }>([
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return { totalQr, activeQr, unassignedQr, totalMerchants, totalScans, topScanned, daily };
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{numberFormat.format(value)}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

export default async function AdminDashboardPage() {
  await dbConnect();
  const { totalQr, activeQr, unassignedQr, totalMerchants, totalScans, topScanned, daily } = await loadStats();
  const peak = Math.max(1, ...daily.map((day) => day.count));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted">Everything at a glance.</p>
        </div>
        <Link href="/admin/qr-generator" className={buttonClass.primary}>
          Generate QR codes
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total QR codes" value={totalQr} />
        <StatCard label="Active" value={activeQr} hint={`${totalQr ? Math.round((activeQr / totalQr) * 100) : 0}% of all codes`} />
        <StatCard label="Unassigned" value={unassignedQr} hint="Waiting for a shop" />
        <StatCard label="Merchants" value={totalMerchants} />
        <StatCard label="Total scans" value={totalScans} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Scans by date" description="Total scans recorded per day." />
          <div className="space-y-1.5 px-5 py-4">
            {daily.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No scans recorded yet.</p>
            ) : (
              daily.slice(-14).map((day) => (
                <div key={day._id} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-muted tabular-nums">{day._id}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-gray-800" style={{ width: `${Math.round((day.count / peak) * 100)}%` }} />
                  </div>
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums">{numberFormat.format(day.count)}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Most scanned QR codes" description="Top five by lifetime scans." />
          <div className="px-5 py-4">
            {topScanned.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No scans recorded yet.</p>
            ) : (
              <ol className="divide-y divide-line">
                {topScanned.map((entry, index) => (
                  <li key={entry._id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="flex items-center gap-3">
                      <span className="w-4 text-xs text-muted tabular-nums">{index + 1}</span>
                      <Link href={`/admin/qr?q=${entry._id}`} className="font-mono text-[13px] hover:underline">
                        {entry._id}
                      </Link>
                    </span>
                    <span className="text-xs text-muted tabular-nums">{numberFormat.format(entry.count)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-5 text-sm text-muted">
        <p>
          Every printed code points at <span className="font-mono text-ink">{qrRedirectUrl("QRA7K29X4P")}</span>. Change a
          destination from <Link href="/admin/qr" className={buttonClass.link}>QR Management</Link> and the physical card
          keeps working.
        </p>
      </Card>
    </div>
  );
}
