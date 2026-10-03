"use client";

import { useState } from "react";
import type { DestinationType, QrStatus } from "@/types";
import { Card, MonoId, StatusBadge, buttonClass, inputClass, labelClass } from "@/components/ui";
import { MAX_ZIP_COUNT } from "@/validation/schemas";

export type DesignBatchQr = {
  qrId: string;
  status: QrStatus;
  type: DestinationType | null;
  businessName: string | null;
};

const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

/**
 * Picks QR codes, previews one finished design per code and offers the batch as a
 * ZIP. Designs are rendered on demand by the server, so nothing is stored.
 */
export function DesignBatch({ templateId, candidates }: { templateId: string; candidates: DesignBatchQr[] }) {
  const [count, setCount] = useState(Math.min(20, candidates.length));
  const [status, setStatus] = useState<QrStatus | "">("GENERATED");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [zipPending, setZipPending] = useState(false);

  const pool = status ? candidates.filter((candidate) => candidate.status === status) : candidates;

  function generatePreview() {
    setError("");
    setSelected(pool.slice(0, Math.min(count, MAX_ZIP_COUNT)).map((candidate) => candidate.qrId));
  }

  async function downloadZip() {
    setZipPending(true);
    setError("");

    try {
      const response = await fetch("/api/admin/designs/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId, qrIds: selected }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? "The ZIP could not be created.");
        return;
      }

      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "qr-batch.zip";

      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setZipPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="batch-status" className={labelClass}>Take QR codes with status</label>
            <select id="batch-status" value={status} onChange={(event) => setStatus(event.target.value as QrStatus | "")} className={inputClass}>
              <option value="">Any status</option>
              {["GENERATED", "ACTIVE", "INACTIVE"].map((option) => (
                <option key={option} value={option}>
                  {label(option)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="batch-count" className={labelClass}>Number of designs</label>
            <input
              id="batch-count"
              type="number"
              min={1}
              max={MAX_ZIP_COUNT}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className={inputClass}
            />
          </div>

          <button type="button" onClick={generatePreview} disabled={pool.length === 0} className={buttonClass.primary}>
            Generate Preview
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <p className="mt-3 text-xs text-muted">
          {pool.length.toLocaleString("en-IN")} of the {candidates.length.toLocaleString("en-IN")} most recent QR codes match this
          filter. Up to {MAX_ZIP_COUNT} designs per download.
        </p>
      </Card>

      {selected.length > 0 ? (
        <Card>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{selected.length} designs ready</h2>
              <p className="mt-0.5 text-sm text-muted">Same artwork, one unique QR and ID per card.</p>
            </div>
            <button type="button" onClick={downloadZip} disabled={zipPending} className={buttonClass.primary}>
              {zipPending ? "Building ZIP…" : "Download All"}
            </button>
          </header>

          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {selected.map((qrId) => {
              const record = candidates.find((candidate) => candidate.qrId === qrId);
              return (
                <figure key={qrId} className="space-y-2">
                  <img
                    src={`/api/admin/qr/${qrId}/design?templateId=${templateId}`}
                    alt={`Design for ${qrId}`}
                    width={220}
                    height={280}
                    className="w-full rounded-md border border-line object-contain"
                  />
                  <figcaption className="flex items-start justify-between gap-2">
                    <span>
                      <MonoId value={qrId} />
                      <span className="mt-1 block">
                        <StatusBadge status={record?.status ?? "GENERATED"} />
                      </span>
                    </span>
                    <a
                      href={`/api/admin/qr/${qrId}/design?templateId=${templateId}`}
                      download={`${qrId}.png`}
                      className={buttonClass.link}
                    >
                      PNG
                    </a>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
