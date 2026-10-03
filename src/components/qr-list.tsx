"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { destinationLabel } from "@/types";
import { Card, EmptyState, MonoId, StatusBadge, buttonClass } from "@/components/ui";
import { QrActions, type QrActionTarget } from "@/components/qr-actions";

/** One admin QR row, with the merchant already joined in by the server page. */
export type QrListRow = QrActionTarget & { merchantId: string | null };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function truncate(value: string | null): string {
  if (!value) return "—";
  return value.length > 42 ? `${value.slice(0, 42)}…` : value;
}

const countOf = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** "3 QR selected" reads better than "3 QRs selected". */
const selectionLabel = (count: number) => `${count} QR selected`;

/**
 * The QR table, with row selection and bulk delete.
 *
 * The page fetches the rows on the server and passes them in, so a selection only
 * ever covers what is currently on screen: a filtered or paginated list can never
 * be deleted by accident from another page.
 */
export function QrList({ rows }: { rows: QrListRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selectAll = useRef<HTMLInputElement>(null);

  // Deleted rows leave the table straight away; the refresh afterwards is what
  // makes it permanent. A QR ID is never reused, so hiding it is safe.
  const visible = useMemo(() => rows.filter((row) => !deleted.includes(row.qrId)), [rows, deleted]);
  const visibleIds = useMemo(() => visible.map((row) => row.qrId), [visible]);
  const chosen = useMemo(() => visibleIds.filter((qrId) => selected.includes(qrId)), [visibleIds, selected]);
  const allSelected = visibleIds.length > 0 && chosen.length === visibleIds.length;
  const includesActive = visible.some((row) => row.status === "ACTIVE" && chosen.includes(row.qrId));

  // Indeterminate is a DOM property rather than an attribute, so it is set here.
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = chosen.length > 0 && !allSelected;
  }, [chosen.length, allSelected]);

  // Filtering or paging replaces the rows, so a selection made on the previous
  // page is dropped rather than carried over to codes that are no longer shown.
  useEffect(() => {
    setSelected((current) => {
      const kept = current.filter((qrId) => visibleIds.includes(qrId));
      return kept.length === current.length ? current : kept;
    });
  }, [visibleIds]);

  function toggle(qrId: string) {
    setSelected((current) => (current.includes(qrId) ? current.filter((id) => id !== qrId) : [...current, qrId]));
  }

  async function remove() {
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/admin/qr", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qrIds: chosen }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? "Those QR codes could not be deleted.");
        return;
      }

      setDeleted((current) => [...current, ...chosen]);
      setSelected([]);
      setConfirming(false);
      setNotice(`${countOf(Number(payload?.data?.deleted ?? 0), "QR code")} deleted successfully.`);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              ref={selectAll}
              type="checkbox"
              checked={allSelected}
              disabled={visibleIds.length === 0}
              onChange={() => setSelected(allSelected ? [] : visibleIds)}
              aria-label="Select all QR codes on this page"
              className="h-4 w-4 accent-gray-900"
            />
            Select All
          </label>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">{selectionLabel(chosen.length)}</span>
            <button
              type="button"
              disabled={chosen.length === 0}
              onClick={() => {
                setError("");
                setConfirming(true);
              }}
              className={buttonClass.danger}
            >
              Delete Selected
            </button>
          </div>
        </div>

        {notice ? (
          <p role="status" className="border-b border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
            {notice}
          </p>
        ) : null}

        {visible.length === 0 ? (
          <EmptyState title="No QR codes left on this page" hint="The rest of the list is unchanged." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-4xl text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th scope="col" className="w-10 px-4 py-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">QR ID</th>
                  <th scope="col" className="px-4 py-3 font-medium">Business</th>
                  <th scope="col" className="px-4 py-3 font-medium">Type</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Destination</th>
                  <th scope="col" className="px-4 py-3 font-medium">Scans</th>
                  <th scope="col" className="px-4 py-3 font-medium">Created</th>
                  <th scope="col" className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((row) => (
                  <tr key={row.qrId} className="align-top">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(row.qrId)}
                        onChange={() => toggle(row.qrId)}
                        aria-label={`Select ${row.qrId}`}
                        className="mt-0.5 h-4 w-4 accent-gray-900"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/qr/${row.qrId}`} className="hover:underline">
                        <MonoId value={row.qrId} />
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {row.merchantId ? (
                        <Link href={`/admin/merchants/${row.merchantId}`} className="hover:underline">
                          {row.businessName}
                        </Link>
                      ) : (
                        <span className="text-muted">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{destinationLabel(row.type)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="max-w-56 truncate px-4 py-3 text-muted" title={row.destinationUrl ?? undefined}>
                      {truncate(row.destinationUrl)}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <span className="tabular-nums">{row.scanCount.toLocaleString("en-IN")}</span>
                      {row.lastScannedAt ? (
                        <span className="mt-0.5 block text-xs whitespace-nowrap">
                          {dateFormat.format(new Date(row.lastScannedAt))}
                        </span>
                      ) : (
                        <span className="mt-0.5 block text-xs whitespace-nowrap">never scanned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{dateFormat.format(new Date(row.createdAt))}</td>
                    <td className="px-4 py-3">
                      <QrActions qr={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-qr-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-line bg-surface sm:rounded-xl"
          >
            <header className="flex items-center justify-between gap-4 border-b border-line bg-surface px-5 py-3">
              <h2 id="delete-qr-title" className="text-sm font-semibold">
                Delete {countOf(chosen.length, "QR code")}?
              </h2>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                aria-label="Close"
                className="text-muted hover:text-ink"
              >
                ✕
              </button>
            </header>

            <div className="space-y-4 px-5 py-4">
              <p className="text-sm text-muted">This action cannot be undone.</p>

              {includesActive ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  Some selected QR codes are active. Deleting them will permanently disable their existing links.
                </p>
              ) : null}

              {error ? (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={buttonClass.secondary}>
                  Cancel
                </button>
                <button type="button" onClick={() => void remove()} disabled={pending} className={buttonClass.danger}>
                  {pending ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
