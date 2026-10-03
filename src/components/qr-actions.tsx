"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DESTINATION_CONFIG, DESTINATION_TYPES, type DestinationType, type QrStatus } from "@/types";
import { buttonClass, inputClass, labelClass } from "@/components/ui";

export type QrActionTarget = {
  qrId: string;
  status: QrStatus;
  type: DestinationType | null;
  destinationUrl: string | null;
  businessName: string | null;
  ownerName: string | null;
  mobile: string | null;
  createdAt: string;
  lastScannedAt: string | null;
  scanCount: number;
};

type MerchantOption = { _id: string; businessName: string; name: string; mobile: string };
type DialogMode = "view" | "edit" | "status" | "reassign" | null;

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function QrActions({ qr }: { qr: QrActionTarget }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);

  useEffect(() => {
    if (dialog !== "reassign" || merchants.length > 0) return;

    fetch("/api/admin/merchants?limit=200")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => setMerchants(body?.data?.items ?? []))
      .catch(() => setMerchants([]));
  }, [dialog, merchants.length]);

  async function send(url: string, method: string, body?: unknown) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? "That did not work. Please try again.");
        return false;
      }

      setDialog(null);
      router.refresh();
      return true;
    } catch {
      setError("Could not reach the server. Please try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  const nextStatus: QrStatus = qr.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setDialog("view")} className={buttonClass.secondary}>
          View
        </button>
        <button type="button" onClick={() => setDialog("edit")} className={buttonClass.secondary}>
          Edit
        </button>
        <button
          type="button"
          onClick={() => setDialog("status")}
          className={qr.status === "ACTIVE" ? buttonClass.danger : buttonClass.secondary}
        >
          {qr.status === "ACTIVE" ? "Deactivate" : "Activate"}
        </button>
        <button type="button" onClick={() => setDialog("reassign")} className={buttonClass.secondary}>
          Reassign
        </button>
      </div>

      {dialog ? (
        <Dialog title={titleFor(dialog, qr.qrId)} onClose={() => setDialog(null)}>
          {error ? <ErrorBanner message={error} /> : null}
          {dialog === "view" ? <ViewPanel qr={qr} /> : null}
          {dialog === "edit" ? <EditPanel qr={qr} pending={pending} onSubmit={(values) => send(`/api/admin/qr/${qr.qrId}`, "PATCH", values)} /> : null}
          {dialog === "status" ? (
            <StatusPanel
              qr={qr}
              pending={pending}
              nextStatus={nextStatus}
              onConfirm={() =>
                send(`/api/admin/qr/${qr.qrId}`, "PATCH", { status: nextStatus })
              }
            />
          ) : null}
          {dialog === "reassign" ? (
            <ReassignPanel
              qr={qr}
              merchants={merchants}
              pending={pending}
              onSubmit={(values) => send(`/api/admin/qr/${qr.qrId}/reassign`, "POST", values)}
            />
          ) : null}
        </Dialog>
      ) : null}
    </>
  );
}

function titleFor(mode: Exclude<DialogMode, null>, qrId: string): string {
  if (mode === "view") return qrId;
  if (mode === "edit") return `Edit destination · ${qrId}`;
  if (mode === "status") return `Change status · ${qrId}`;
  return `Reassign · ${qrId}`;
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-line bg-surface sm:rounded-xl">
        <header className="sticky top-0 flex items-center justify-between gap-4 border-b border-line bg-surface px-5 py-3">
          <h2 className="truncate font-mono text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            ✕
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
      {message}
    </p>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="max-w-[60%] text-right text-sm font-medium break-words">{value}</span>
    </div>
  );
}

function ViewPanel({ qr }: { qr: QrActionTarget }) {
  return (
    <div className="space-y-4">
      <img
        src={`/api/admin/qr/${qr.qrId}/qr`}
        alt={`QR code for ${qr.qrId}`}
        width={200}
        height={200}
        className="mx-auto rounded-md border border-line"
      />
      <div>
        <Row label="Status" value={qr.status} />
        <Row label="Business" value={qr.businessName ?? "Unassigned"} />
        <Row label="Owner" value={qr.ownerName ?? "—"} />
        <Row label="Mobile" value={qr.mobile ?? "—"} />
        <Row label="Destination type" value={qr.type ? DESTINATION_CONFIG[qr.type].label : "—"} />
        <Row label="Destination" value={qr.destinationUrl ?? "—"} />
        <Row label="Scans" value={qr.scanCount.toLocaleString("en-IN")} />
        <Row label="Last scan" value={qr.lastScannedAt ? dateFormat.format(new Date(qr.lastScannedAt)) : "Never"} />
        <Row label="Created" value={dateFormat.format(new Date(qr.createdAt))} />
      </div>
      <a href={`/q/${qr.qrId}`} target="_blank" rel="noreferrer" className={buttonClass.link}>
        Open the customer-facing link
      </a>
    </div>
  );
}

function EditPanel({
  qr,
  pending,
  onSubmit,
}: {
  qr: QrActionTarget;
  pending: boolean;
  onSubmit: (values: { type: DestinationType; destination: string }) => Promise<boolean>;
}) {
  const [type, setType] = useState<DestinationType>(qr.type ?? "INSTAGRAM");
  const [destination, setDestination] = useState(qr.destinationUrl ?? "");

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({ type, destination });
      }}
    >
      <p className="text-sm text-muted">Saving a new destination updates the printed card immediately.</p>

      <div>
        <label htmlFor="edit-type" className={labelClass}>Destination type</label>
        <select id="edit-type" value={type} onChange={(event) => setType(event.target.value as DestinationType)} className={inputClass}>
          {DESTINATION_TYPES.map((option) => (
            <option key={option} value={option}>
              {DESTINATION_CONFIG[option].label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="edit-destination" className={labelClass}>
          {DESTINATION_CONFIG[type].input === "phone" ? "WhatsApp number" : "Destination URL"}
        </label>
        <input
          id="edit-destination"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          placeholder={DESTINATION_CONFIG[type].placeholder}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-muted">{DESTINATION_CONFIG[type].help}</p>
      </div>

      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? "Saving…" : "Save destination"}
      </button>
    </form>
  );
}

function StatusPanel({
  qr,
  pending,
  nextStatus,
  onConfirm,
}: {
  qr: QrActionTarget;
  pending: boolean;
  nextStatus: QrStatus;
  onConfirm: () => Promise<boolean>;
}) {
  const pausing = nextStatus === "INACTIVE";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {pausing
          ? "Scanning this code will show the “not active” page. The destination is kept and can be switched back on later."
          : "Scanning this code will start redirecting to its destination again."}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => void onConfirm()} disabled={pending} className={pausing ? buttonClass.danger : buttonClass.primary}>
          {pending ? "Working…" : pausing ? "Deactivate QR" : "Activate QR"}
        </button>
      </div>
      <p className="text-xs text-muted">Current status: {qr.status}</p>
    </div>
  );
}

function ReassignPanel({
  qr,
  merchants,
  pending,
  onSubmit,
}: {
  qr: QrActionTarget;
  merchants: MerchantOption[];
  pending: boolean;
  onSubmit: (values: Record<string, unknown>) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"existing" | "manual">(merchants.length > 0 ? "existing" : "manual");
  const [merchantId, setMerchantId] = useState("");
  const [mobile, setMobile] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void onSubmit(mode === "existing" ? { merchantId } : { mobile, ownerName, businessName });
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <p className="text-sm text-muted">
        The card is not reprinted. It keeps the same QR ID and starts sending people to the new shop.
      </p>

      {merchants.length > 0 ? (
        <div className="flex gap-2">
          {(["existing", "manual"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                mode === option ? "bg-gray-900 text-white" : "border border-line bg-surface text-muted"
              }`}
            >
              {option === "existing" ? "Existing merchant" : "Different mobile number"}
            </button>
          ))}
        </div>
      ) : null}

      {mode === "existing" ? (
        <div>
          <label htmlFor="merchant" className={labelClass}>Merchant</label>
          <select id="merchant" required value={merchantId} onChange={(event) => setMerchantId(event.target.value)} className={inputClass}>
            <option value="">Choose a merchant…</option>
            {merchants.map((merchant) => (
              <option key={merchant._id} value={merchant._id}>
                {merchant.businessName} · {merchant.mobile}
              </option>
            ))}
          </select>
          {qr.businessName ? <p className="mt-1 text-xs text-muted">Currently assigned to {qr.businessName}.</p> : null}
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="ra-mobile" className={labelClass}>Mobile number</label>
            <input id="ra-mobile" required value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="919876543210" className={inputClass} />
          </div>
          <div>
            <label htmlFor="ra-business" className={labelClass}>Business name</label>
            <input id="ra-business" required value={businessName} onChange={(event) => setBusinessName(event.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="ra-owner" className={labelClass}>Owner name</label>
            <input id="ra-owner" required value={ownerName} onChange={(event) => setOwnerName(event.target.value)} className={inputClass} />
          </div>
        </>
      )}

      <button type="submit" disabled={pending || (mode === "existing" && !merchantId)} className={buttonClass.primary}>
        {pending ? "Reassigning…" : "Reassign QR"}
      </button>
    </form>
  );
}
