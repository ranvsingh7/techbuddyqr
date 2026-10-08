import type { Metadata } from "next";
import { extractQrId } from "@/lib/destination";
import { ActivationForm } from "@/components/activation-form";

export const metadata: Metadata = {
  title: "Activate your QR card",
  description: "Activate your QR card and choose where it should send customers.",
};

/**
 * Public activation screen. Customers land here from the card itself, usually on
 * a phone, so the layout is single column and thumb sized throughout.
 */
export default async function ActivatePage({ searchParams }: PageProps<"/activate">) {
  const params = await searchParams;
  const qrId = extractQrId(typeof params.qr === "string" ? params.qr : "") ?? "";

  return (
    <main className="relative isolate min-h-dvh overflow-hidden">
      {/* Backdrop: soft light washes of the brand gradient, deliberately
          low-contrast so the card stays the focus. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-violet-50/40 to-slate-50" />
        <div className="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-blue-300/25 blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-white to-transparent" />
      </div>

      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 py-8 sm:py-12">
        <header className="animate-rise mb-7 text-center">
          <div className="inline-flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-3 shadow-md shadow-accent-2/25">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5 text-white">
                <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" fill="currentColor" />
                <rect x="13.5" y="3.5" width="7" height="7" rx="3.5" fill="currentColor" opacity="0.65" />
                <rect x="3.5" y="13.5" width="7" height="7" rx="3.5" fill="currentColor" opacity="0.65" />
                <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" fill="currentColor" />
              </svg>
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">TechBuddy</span>
          </div>
          <p className="mt-3 text-[13px] font-medium tracking-wide text-accent-2 uppercase">Activate your digital card</p>
        </header>

        {/* Glass card: the translucent surface plus a soft ring keeps it legible
            over the gradient without a heavy border. */}
        <div className="animate-rise-slow rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-900/8 ring-1 ring-slate-900/5 backdrop-blur-xl sm:p-7">
          <div className="mb-6">
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 sm:text-2xl">Activate your card</h1>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              Enter your details, scan the card you received, and pick where customers should land.
            </p>
          </div>

          <ActivationForm initialQrId={qrId} />
        </div>

        <div className="mt-auto pt-8">
          <div className="flex items-center justify-center gap-2 text-xs text-muted">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600">
              <path
                fillRule="evenodd"
                d="M10 1a4.5 4.5 0 0 0-4.5 4.5V6H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 5V5.5a3 3 0 1 0-6 0V6h6Z"
                clipRule="evenodd"
              />
            </svg>
            Your details are only used to set up this card.
          </div>
          <p className="mt-2 text-center text-xs text-muted">Need help? Contact the business that supplied your card.</p>
        </div>
      </div>
    </main>
  );
}