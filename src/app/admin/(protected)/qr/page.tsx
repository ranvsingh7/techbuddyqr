import Link from "next/link";
import { DESTINATION_TYPES, QR_STATUSES, type DestinationType, type QrStatus } from "@/types";
import { countScansByQrId, listQrCodes } from "@/services/qr-query";
import { Card, EmptyState, buttonClass, inputClass } from "@/components/ui";
import { QrList, type QrListRow } from "@/components/qr-list";

export const dynamic = "force-dynamic";

export const metadata = { title: "QR management" };

const STATUS_LABEL: Record<QrStatus, string> = { GENERATED: "Generated", ACTIVE: "Active", INACTIVE: "Inactive" };
const TYPE_LABEL: Record<DestinationType, string> = {
  INSTAGRAM: "Instagram",
  GOOGLE_REVIEW: "Google",
  WHATSAPP: "WhatsApp",
  CUSTOM: "Custom",
};

function buildQuery(params: Record<string, string | string[] | undefined>, overrides: Record<string, string> = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single) search.set(key, single);
  }
  return search;
}

export default async function AdminQrPage({ searchParams }: PageProps<"/admin/qr">) {
  const params = await searchParams;

  const filters = {
    q: typeof params.q === "string" ? params.q : undefined,
    status: QR_STATUSES.includes(params.status as QrStatus) ? (params.status as QrStatus) : undefined,
    type: DESTINATION_TYPES.includes(params.type as DestinationType) ? (params.type as DestinationType) : undefined,
    page: Number(params.page) > 0 ? Number(params.page) : 1,
    limit: 25,
  };

  const { items, total, page, pages } = await listQrCodes(filters);

  const scanCountById = await countScansByQrId(items.map((item) => item.qrId));

  const rows: QrListRow[] = items.map((item) => ({
    qrId: item.qrId,
    status: item.status,
    type: item.type,
    destinationUrl: item.destinationUrl,
    businessName: item.merchant?.businessName ?? null,
    ownerName: item.merchant?.name ?? null,
    mobile: item.merchant?.mobile ?? null,
    merchantId: item.merchant ? String(item.merchant._id) : null,
    createdAt: new Date(item.createdAt).toISOString(),
    lastScannedAt: item.lastScannedAt ? new Date(item.lastScannedAt).toISOString() : null,
    scanCount: scanCountById.get(item.qrId) ?? 0,
  }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">QR Management</h1>
          <p className="mt-0.5 text-sm text-muted">{total.toLocaleString("en-IN")} QR codes</p>
        </div>
        <Link href="/admin/qr-generator" className={buttonClass.primary}>
          Generate QR codes
        </Link>
      </header>

      <Card className="p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Search QR ID, business name or mobile"
            aria-label="Search QR codes"
            className={inputClass}
          />

          <select name="status" defaultValue={filters.status ?? ""} aria-label="Filter by status" className={inputClass}>
            <option value="">All statuses</option>
            {QR_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>

          <select name="type" defaultValue={filters.type ?? ""} aria-label="Filter by destination type" className={inputClass}>
            <option value="">All types</option>
            {DESTINATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABEL[type]}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <button type="submit" className={buttonClass.primary}>
              Filter
            </button>
            <Link href="/admin/qr" className={buttonClass.secondary}>
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {items.length === 0 ? (
        <Card className="overflow-hidden">
          <EmptyState title="No QR codes match" hint="Try a different search or clear the filters." />
        </Card>
      ) : (
        <QrList rows={rows} />
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Link
              href={`/admin/qr?${buildQuery(params, { page: String(page - 1) })}`}
              aria-disabled={page <= 1}
              className={`${buttonClass.secondary} ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
            >
              Previous
            </Link>
            <Link
              href={`/admin/qr?${buildQuery(params, { page: String(page + 1) })}`}
              aria-disabled={page >= pages}
              className={`${buttonClass.secondary} ${page >= pages ? "pointer-events-none opacity-40" : ""}`}
            >
              Next
            </Link>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
