"use client";

import { useState } from "react";
import { extractQrId } from "@/lib/destination";
import { DESTINATION_CONFIG, DESTINATION_TYPES, QR_ID_PATTERN, type DestinationType } from "@/types";
import { QrScanner } from "@/components/qr-scanner";
import { FieldError, buttonClass, inputClass, labelClass } from "@/components/ui";

type FormValues = { qrId: string; mobile: string; ownerName: string; businessName: string; type: DestinationType; destination: string };
type FieldErrors = Partial<Record<keyof FormValues, string>>;

const EMPTY: FormValues = { qrId: "", mobile: "", ownerName: "", businessName: "", type: "INSTAGRAM", destination: "" };

export function ActivationForm({ initialQrId = "" }: { initialQrId?: string }) {
  const [values, setValues] = useState<FormValues>({ ...EMPTY, qrId: initialQrId });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ qrId: string; businessName: string; destinationUrl: string } | null>(null);

  const update = <Key extends keyof FormValues>(key: Key, value: FormValues[Key]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const setQrId = (value: string) => {
    const qrId = extractQrId(value) ?? value.trim().toUpperCase();
    update("qrId", qrId);
    setFieldErrors((current) => ({ ...current, qrId: "" }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setFormError("");
    setFieldErrors({});

    try {
      const response = await fetch("/api/merchant/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json();

      if (!response.ok) {
        const details = (body?.error?.details ?? {}) as FieldErrors;
        setFieldErrors(details);
        setFormError(body?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      setResult(body.data);
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-emerald-900">QR activated successfully.</h2>
        <dl className="mx-auto mt-4 max-w-sm space-y-2 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-emerald-800">QR ID</dt>
            <dd className="font-mono font-semibold text-emerald-950">{result.qrId}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-emerald-800">Business</dt>
            <dd className="font-medium text-emerald-950">{result.businessName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-emerald-800">Destination</dt>
            <dd className="truncate text-emerald-950">{result.destinationUrl}</dd>
          </div>
        </dl>
        <p className="mt-5 text-sm text-emerald-800">You can print the card and it is ready to use.</p>
      </div>
    );
  }

  const config = DESTINATION_CONFIG[values.type];

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {formError ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </p>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold tracking-wide text-muted uppercase">Step 1 · Your details</legend>

        <div>
          <label htmlFor="mobile" className={labelClass}>Mobile number</label>
          <input
            id="mobile"
            name="mobile"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="919876543210"
            value={values.mobile}
            onChange={(event) => update("mobile", event.target.value)}
            className={inputClass}
          />
          <FieldError message={fieldErrors.mobile} />
        </div>

        <div>
          <label htmlFor="businessName" className={labelClass}>Business name</label>
          <input
            id="businessName"
            name="businessName"
            type="text"
            autoComplete="organization"
            placeholder="Raj Restaurant"
            value={values.businessName}
            onChange={(event) => update("businessName", event.target.value)}
            className={inputClass}
          />
          <FieldError message={fieldErrors.businessName} />
        </div>

        <div>
          <label htmlFor="ownerName" className={labelClass}>Owner name</label>
          <input
            id="ownerName"
            name="ownerName"
            type="text"
            autoComplete="name"
            placeholder="Rajesh Kumar"
            value={values.ownerName}
            onChange={(event) => update("ownerName", event.target.value)}
            className={inputClass}
          />
          <FieldError message={fieldErrors.ownerName} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold tracking-wide text-muted uppercase">Step 2 · Your QR card</legend>

        <QrScanner onDetected={setQrId} disabled={pending} />

        <div>
          <label htmlFor="qrId" className={labelClass}>QR ID</label>
          <input
            id="qrId"
            name="qrId"
            type="text"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="QRA7K29X4P"
            value={values.qrId}
            onChange={(event) => setQrId(event.target.value)}
            className={`${inputClass} font-mono tracking-wider`}
          />
          <p className="mt-1 text-xs text-muted">Printed under the QR code on your card. You can also scan the card above.</p>
          <FieldError message={fieldErrors.qrId} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold tracking-wide text-muted uppercase">Step 3 · Where should this QR go?</legend>

        <div className="grid gap-2 sm:grid-cols-2">
          {DESTINATION_TYPES.map((type) => (
            <label
              key={type}
              className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm transition ${
                values.type === type ? "border-gray-900 bg-gray-50 font-medium" : "border-line bg-surface hover:bg-canvas"
              }`}
            >
              <input
                type="radio"
                name="type"
                value={type}
                checked={values.type === type}
                onChange={() => update("type", type)}
                className="h-4 w-4 accent-gray-900"
              />
              {DESTINATION_CONFIG[type].label}
            </label>
          ))}
        </div>

        <div>
          <label htmlFor="destination" className={labelClass}>
            {values.type === "WHATSAPP" ? "WhatsApp number" : `${config.label} URL`}
          </label>
          <input
            id="destination"
            name="destination"
            type="text"
            inputMode={config.input === "phone" ? "tel" : "url"}
            placeholder={config.placeholder}
            value={values.destination}
            onChange={(event) => update("destination", event.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted">{config.help}</p>
          <FieldError message={fieldErrors.destination} />
        </div>
      </fieldset>

      <button type="submit" disabled={pending || !values.qrId} className={`${buttonClass.primary} w-full py-3`}>
        {pending ? "Activating…" : "Activate QR"}
      </button>

      {values.qrId && !QR_ID_PATTERN.test(values.qrId) ? (
        <p className="text-center text-xs text-muted">A QR ID looks like QRA7K29X4P — 10 characters starting with QR.</p>
      ) : null}
    </form>
  );
}
