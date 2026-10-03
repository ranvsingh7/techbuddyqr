"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, MonoId, StatusBadge, buttonClass, inputClass, labelClass } from "@/components/ui";
import { MAX_BULK_COUNT } from "@/validation/schemas";

type Generated = { qrIds: string[] };

export function BulkGenerator() {
  const router = useRouter();
  const [count, setCount] = useState(20);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/admin/qr/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? "Could not generate QR codes.");
        return;
      }

      setGenerated(body.data as Generated);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <form onSubmit={generate} className="space-y-4 p-5">
          {error ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="max-w-xs">
            <label htmlFor="count" className={labelClass}>
              Number of QR codes
            </label>
            <input
              id="count"
              type="number"
              min={1}
              max={MAX_BULK_COUNT}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-muted">Between 1 and {MAX_BULK_COUNT}. Every ID is unique across the system.</p>
          </div>

          <button type="submit" disabled={pending} className={buttonClass.primary}>
            {pending ? "Generating…" : "Generate QR Codes"}
          </button>
        </form>
      </Card>

      {generated ? (
        <Card>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{generated.qrIds.length} QR codes generated</h2>
              <p className="mt-0.5 text-sm text-muted">
                Status is Generated until a shop activates one. Apply a design template to print them.
              </p>
            </div>
            <Link href="/admin/templates" className={buttonClass.secondary}>
              Apply a template
            </Link>
          </header>

          <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            {generated.qrIds.map((qrId) => (
              <li key={qrId} className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <img src={`/api/admin/qr/${qrId}/qr`} alt="" width={44} height={44} className="rounded border border-line" />
                  <div>
                    <MonoId value={qrId} />
                    <div className="mt-1">
                      <StatusBadge status="GENERATED" />
                    </div>
                  </div>
                </div>
                <a href={`/api/admin/qr/${qrId}/qr`} download={`${qrId}.png`} className={buttonClass.link}>
                  Download
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
