"use client";

import { useState } from "react";
import { extractQrId } from "@/lib/destination";
import { DESTINATION_CONFIG, DESTINATION_TYPES, QR_ID_PATTERN, type DestinationType } from "@/types";
import { Confetti } from "@/components/confetti";
import { DESTINATION_ACCENT, DestinationIcon } from "@/components/destination-icon";
import { QrScanner } from "@/components/qr-scanner";
import { FieldError } from "@/components/ui";

type FormValues = { qrId: string; mobile: string; ownerName: string; businessName: string; type: DestinationType; destination: string };
type FieldErrors = Partial<Record<keyof FormValues, string>>;

/** The API returns the stored destination, so the success screen can show it. */
type ActivationResult = { qrId: string; businessName: string; destinationUrl: string; type?: string; status?: string };

const EMPTY: FormValues = { qrId: "", mobile: "", ownerName: "", businessName: "", type: "INSTAGRAM", destination: "" };

/** Comfortably tappable on a phone, with a clear focus ring. */
const fieldClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-[15px] text-ink shadow-xs outline-none transition placeholder:text-slate-400 focus:border-accent-2 focus:ring-4 focus:ring-accent-2/12";

const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export function ActivationForm({ initialQrId = "" }: { initialQrId?: string }) {
  const [values, setValues] = useState<FormValues>({ ...EMPTY, qrId: initialQrId });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActivationResult | null>(null);
  // Confetti is armed only by a successful response, so it can never fire on
  // load, on a validation failure, or on an API error.
  const [celebrate, setCelebrate] = useState(false);

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
      setCelebrate(true);
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  /** Clears the error and returns focus to the first field, keeping every value. */
  function tryAgain() {
    setFormError("");
    document.getElementById("mobile")?.focus();
  }

  /** Back to a blank form for activating a second card. */
  function activateAnother() {
    setResult(null);
    setCelebrate(false);
    setValues({ ...EMPTY });
    setFieldErrors({});
    setFormError("");
  }

  if (result) {
    return (
      <>
        {celebrate ? <Confetti /> : null}

        <div className="animate-rise text-center">
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
            {/* Soft pulse behind the tick, drawn once and left alone. */}
            <span className="animate-ring absolute inset-0 rounded-full bg-emerald-400/25" />
            <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
              <svg viewBox="0 0 52 52" className="animate-pop h-12 w-12" aria-hidden="true">
                <path
                  className="animate-draw"
                  d="M14 27.5 21.5 35 38 18"
                  fill="none"
                  stroke="var(--color-success)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={48}
                  strokeDasharray={48}
                />
              </svg>
            </span>
          </div>

          <h2 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">Your Card is Activated!</h2>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted">
            Your digital card is now ready to use.
          </p>

          <div className="mt-7 rounded-2xl border border-line bg-slate-50/80 p-5 text-left">
            <dl className="space-y-3.5 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-muted">Card ID</dt>
                <dd className="truncate font-mono font-semibold tracking-wider text-slate-900">{result.qrId}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-muted">Business</dt>
                <dd className="truncate text-right font-medium text-slate-900">{result.businessName}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-muted">Customers land on</dt>
                <dd className="truncate text-right text-accent-2">{result.destinationUrl}</dd>
              </div>
            </dl>
          </div>

          <p className="mt-5 text-sm text-muted">Your card is ready. Print it, or tap it with NFC to send customers to your page.</p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {/* The link the backend stored, so this never invents a destination. */}
            <a
              href={result.destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-3 px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-accent-2/20 transition hover:brightness-110 active:scale-[0.99] sm:w-auto"
            >
              Open your page
            </a>
            <button
              type="button"
              onClick={activateAnother}
              className="inline-flex w-full items-center justify-center rounded-xl border border-line bg-surface px-5 py-3.5 text-[15px] font-medium text-ink transition hover:bg-slate-50 active:scale-[0.99] sm:w-auto"
            >
              Activate another card
            </button>
          </div>
        </div>
      </>
    );
  }

  const config = DESTINATION_CONFIG[values.type];
  const qrIdLooksValid = QR_ID_PATTERN.test(values.qrId);

  return (
    <form onSubmit={submit} noValidate className="space-y-7">
      {formError ? (
        <div role="alert" className="animate-rise flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-red-600">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.5a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5ZM10 13.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
              clipRule="evenodd"
            />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-red-900">We couldn&apos;t activate your card</p>
            <p className="mt-1 text-sm leading-relaxed text-red-700">{formError}</p>
            <button
              type="button"
              onClick={tryAgain}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 underline underline-offset-4 transition hover:text-red-900"
            >
              Try again
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 0 1 .75-.75h9.19L9.72 6.03a.75.75 0 1 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 1 1-1.06-1.06l3.22-3.22H3.75A.75.75 0 0 1 3 10Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="sr-only">Your details</legend>
        <StepHeading step="01" title="Your details" hint="So customers know who they are reaching." />

        <Field label="Mobile number" htmlFor="mobile" error={fieldErrors.mobile}>
          <input
            id="mobile"
            name="mobile"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="919876543210"
            value={values.mobile}
            onChange={(event) => update("mobile", event.target.value)}
            aria-invalid={fieldErrors.mobile ? true : undefined}
            className={fieldClass}
          />
        </Field>

        <Field label="Business name" htmlFor="businessName" error={fieldErrors.businessName}>
          <input
            id="businessName"
            name="businessName"
            type="text"
            autoComplete="organization"
            placeholder="Raj Restaurant"
            value={values.businessName}
            onChange={(event) => update("businessName", event.target.value)}
            aria-invalid={fieldErrors.businessName ? true : undefined}
            className={fieldClass}
          />
        </Field>

        <Field label="Owner name" htmlFor="ownerName" error={fieldErrors.ownerName}>
          <input
            id="ownerName"
            name="ownerName"
            type="text"
            autoComplete="name"
            placeholder="Rajesh Kumar"
            value={values.ownerName}
            onChange={(event) => update("ownerName", event.target.value)}
            aria-invalid={fieldErrors.ownerName ? true : undefined}
            className={fieldClass}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="sr-only">Your QR card</legend>
        <StepHeading step="02" title="Your card" hint="Scan it, or type the ID printed under the code." />

        <QrScanner onDetected={setQrId} disabled={pending} />

        <Field label="Card ID" htmlFor="qrId" error={fieldErrors.qrId}>
          <div className="relative">
            <input
              id="qrId"
              name="qrId"
              type="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="QRA7K29X4P"
              value={values.qrId}
              onChange={(event) => setQrId(event.target.value)}
              aria-invalid={fieldErrors.qrId ? true : undefined}
              className={`${fieldClass} pr-11 font-mono tracking-[0.14em] uppercase`}
            />
            {/* A quiet confirmation that the ID is the right shape. */}
            {values.qrId && qrIdLooksValid ? (
              <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-emerald-600">
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.42L9 10.58 7.7 9.28a1 1 0 0 0-1.42 1.42l2 2a1 1 0 0 0 1.42 0l3-3Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="sr-only">Valid card ID</span>
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">Printed under the QR code on your card. You can also scan the card above.</p>
          <FieldError message={fieldErrors.qrId} />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="sr-only">Where customers should land</legend>
        <StepHeading step="03" title="Where should customers land?" hint="Pick one. You can change it later." />

        <div className="grid gap-2.5 sm:grid-cols-2">
          {DESTINATION_TYPES.map((type) => {
            const accent = DESTINATION_ACCENT[type];
            const selected = values.type === type;

            return (
              <label
                key={type}
                className={`group relative flex cursor-pointer items-center gap-3 rounded-xl border bg-surface p-3.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-2/70 has-[:focus-visible]:ring-offset-2 ${
                  selected ? `border-transparent shadow-sm ring-2 ${accent.ring}` : "border-line hover:border-slate-300 hover:bg-slate-50/60"
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={type}
                  checked={selected}
                  onChange={() => update("type", type)}
                  className="sr-only"
                />
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent.tint} ${accent.text} transition group-hover:scale-105`}
                >
                  <DestinationIcon type={type} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${selected ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                    {DESTINATION_CONFIG[type].label}
                  </span>
                </span>
                {/* Selection dot, shown only for the chosen option. */}
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                    selected ? accent.dot : "border-slate-300 bg-surface"
                  }`}
                >
                  {selected ? (
                    <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3 text-white">
                      <path d="M2.5 6.2 4.8 8.5 9.5 3.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>

        <Field
          label={values.type === "WHATSAPP" ? "WhatsApp number" : `${config.label} URL`}
          htmlFor="destination"
          error={fieldErrors.destination}
        >
          <input
            id="destination"
            name="destination"
            type="text"
            inputMode={config.input === "phone" ? "tel" : "url"}
            autoComplete={config.input === "phone" ? "tel" : "url"}
            placeholder={config.placeholder}
            value={values.destination}
            onChange={(event) => update("destination", event.target.value)}
            aria-invalid={fieldErrors.destination ? true : undefined}
            className={fieldClass}
          />
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{config.help}</p>
          <FieldError message={fieldErrors.destination} />
        </Field>
      </fieldset>

      <div className="pt-1">
        <button
          type="submit"
          disabled={pending || !values.qrId}
          className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-accent via-accent-2 to-accent-3 px-5 py-4 text-[15px] font-semibold text-white shadow-lg shadow-accent-2/25 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:text-slate-500 disabled:shadow-none"
        >
          {pending ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Activating your card…
            </>
          ) : (
            "Activate Card"
          )}
        </button>

        {values.qrId && !qrIdLooksValid ? (
          <p className="mt-2.5 text-center text-xs text-muted">A Card ID looks like QRA7K29X4P — 10 characters starting with QR.</p>
        ) : null}
      </div>
    </form>
  );
}

/** Numbered section heading, kept out of the field order so the legend stays clean. */
function StepHeading({ step, title, hint }: { step: string; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 rounded-lg bg-gradient-to-br from-accent to-accent-3 px-2 py-1 font-mono text-[11px] font-semibold text-white shadow-sm">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{hint}</p>
      </div>
    </div>
  );
}

/** Label + control + inline error, with the error wired up for screen readers. */
function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 shrink-0">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.5a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5ZM10 13.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      ) : null}
    </div>
  );
}