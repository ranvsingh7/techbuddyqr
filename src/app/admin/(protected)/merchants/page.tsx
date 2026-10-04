import Link from "next/link";
import { listMerchants } from "@/services/merchant-query";
import { Card, EmptyState, buttonClass, inputClass } from "@/components/ui";
import { dbConnect } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Merchants" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function AdminMerchantsPage({ searchParams }: PageProps<"/admin/merchants">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  await dbConnect();
  const { items, total, pages } = await listMerchants({ q, page, limit: 25 });
  const pageLink = (target: number) => `/admin/merchants?${new URLSearchParams({ ...(q ? { q } : {}), page: String(target) })}`;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Merchants</h1>
        <p className="mt-0.5 text-sm text-muted">{total.toLocaleString("en-IN")} shops have activated at least one QR code.</p>
      </header>

      <Card className="p-4">
        <form method="get" className="flex flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search business, owner or mobile"
            aria-label="Search merchants"
            className={`${inputClass} sm:max-w-sm`}
          />
          <button type="submit" className={buttonClass.primary}>
            Search
          </button>
          {q ? (
            <Link href="/admin/merchants" className={buttonClass.secondary}>
              Reset
            </Link>
          ) : null}
        </form>
      </Card>

      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <EmptyState title="No merchants found" hint="Merchants appear here as soon as a shop activates a QR code." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Mobile</th>
                  <th className="px-4 py-3 font-medium">QR codes</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((merchant) => (
                  <tr key={String(merchant._id)} className="hover:bg-canvas">
                    <td className="px-4 py-3">
                      <Link href={`/admin/merchants/${merchant._id}`} className="font-medium hover:underline">
                        {merchant.businessName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{merchant.name}</td>
                    <td className="px-4 py-3 text-muted tabular-nums">{merchant.mobile}</td>
                    <td className="px-4 py-3 tabular-nums">{merchant.qrCount}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{dateFormat.format(merchant.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pages > 1 ? (
        <nav className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Link
              href={pageLink(page - 1)}
              aria-disabled={page <= 1}
              className={`${buttonClass.secondary} ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
            >
              Previous
            </Link>
            <Link
              href={pageLink(page + 1)}
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
