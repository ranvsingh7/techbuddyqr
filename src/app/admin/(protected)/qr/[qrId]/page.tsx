import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api-error";
import { findQrById } from "@/services/qr";
import { listTemplates } from "@/services/template";
import { ScanEvent } from "@/models/ScanEvent";
import { destinationLabel } from "@/types";
import { Card, CardHeader, StatusBadge, buttonClass } from "@/components/ui";
import { QrActions, type QrActionTarget } from "@/components/qr-actions";
import { dbConnect } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "QR details" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="max-w-[60%] text-right text-sm font-medium break-words">{value}</dd>
    </div>
  );
}

export default async function AdminQrDetailPage({ params }: PageProps<"/admin/qr/[qrId]">) {
  const { qrId } = await params;

  await dbConnect();
  let qr;
  try {
    qr = await findQrById(qrId);
  } catch (error) {
    if (error instanceof ApiError) notFound();
    throw error;
  }
  if (!qr) notFound();

  const [templates, scanCount, recentScans] = await Promise.all([
    listTemplates(),
    ScanEvent.countDocuments({ qrId: qr.qrId }),
    ScanEvent.find({ qrId: qr.qrId }).sort({ timestamp: -1 }).limit(10).lean(),
  ]);

  const merchant = typeof qr.merchantId === "object" && qr.merchantId !== null ? qr.merchantId : null;
  const merchantRecord =
    merchant && "businessName" in merchant ? (merchant as { _id: string; businessName: string; name: string; mobile: string }) : null;

  const target: QrActionTarget = {
    qrId: qr.qrId,
    status: qr.status,
    type: qr.type,
    destinationUrl: qr.destinationUrl,
    businessName: merchantRecord?.businessName ?? null,
    ownerName: merchantRecord?.name ?? null,
    mobile: merchantRecord?.mobile ?? null,
    createdAt: new Date(qr.createdAt!).toISOString(),
    lastScannedAt: qr.lastScannedAt ? new Date(qr.lastScannedAt).toISOString() : null,
    scanCount,
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/qr" className={buttonClass.link}>
            ← Back to QR management
          </Link>
          <h1 className="mt-2 font-mono text-xl font-semibold tracking-wide">{qr.qrId}</h1>
        </div>
        <QrActions qr={target} />
      </header>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="p-5">
          <img
            src={`/api/admin/qr/${qr.qrId}/qr`}
            alt={`QR code for ${qr.qrId}`}
            width={260}
            height={260}
            className="mx-auto rounded-md border border-line"
          />
          <p className="mt-3 text-center font-mono text-sm tracking-wider">{qr.qrId}</p>
          <a
            href={`/api/admin/qr/${qr.qrId}/qr`}
            download={`${qr.qrId}.png`}
            className={`${buttonClass.secondary} mt-4 w-full`}
          >
            Download QR
          </a>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <dl>
              <Detail label="Status" value={<StatusBadge status={qr.status} />} />
              <Detail
                label="Merchant"
                value={
                  merchantRecord ? (
                    <Link href={`/admin/merchants/${merchantRecord._id}`} className={buttonClass.link}>
                      {merchantRecord.businessName}
                    </Link>
                  ) : (
                    "Unassigned"
                  )
                }
              />
              <Detail label="Owner" value={merchantRecord?.name ?? "—"} />
              <Detail label="Mobile" value={merchantRecord?.mobile ?? "—"} />
              <Detail label="Destination type" value={destinationLabel(qr.type)} />
              <Detail label="Destination" value={qr.destinationUrl ?? "—"} />
              <Detail label="Created" value={dateFormat.format(new Date(qr.createdAt!))} />
              <Detail label="Activated" value={qr.activatedAt ? dateFormat.format(new Date(qr.activatedAt)) : "—"} />
              <Detail label="Scans" value={scanCount.toLocaleString("en-IN")} />
              <Detail label="Last scan" value={qr.lastScannedAt ? dateTimeFormat.format(new Date(qr.lastScannedAt)) : "Never"} />
            </dl>
          </Card>

          {templates.length > 0 ? (
            <Card>
              <CardHeader title="Design previews" description="How this card looks on each saved template." />
              <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => (
                  <figure key={String(template._id)} className="space-y-2">
                    <img
                      src={`/api/admin/qr/${qr.qrId}/design?templateId=${template._id}`}
                      alt={`${qr.qrId} on the ${template.name} template`}
                      width={220}
                      height={220}
                      className="w-full rounded-md border border-line object-contain"
                    />
                    <figcaption className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted">{template.name}</span>
                      <a
                        href={`/api/admin/qr/${qr.qrId}/design?templateId=${template._id}`}
                        download={`${qr.qrId}-${template.name.replace(/\s+/g, "-").toLowerCase()}.png`}
                        className={buttonClass.link}
                      >
                        PNG
                      </a>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Recent scans" description="Ten most recent events. Only a salted hash of the visitor IP is stored." />
            <div className="px-5 py-4">
              {recentScans.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No scans recorded yet.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {recentScans.map((scan) => (
                    <li key={String(scan._id)} className="flex items-start justify-between gap-4 py-2">
                      <span className="text-muted tabular-nums">{dateTimeFormat.format(new Date(scan.timestamp))}</span>
                      <span className="max-w-[60%] truncate text-right text-muted">{scan.userAgent ?? "Unknown device"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
