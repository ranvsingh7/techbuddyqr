import type { Metadata } from "next";
import { extractQrId } from "@/lib/destination";
import { ActivationForm } from "@/components/activation-form";

export const metadata: Metadata = {
  title: "Activate your QR card",
  description: "Activate your QR card and choose where it should send customers.",
};

export default async function ActivatePage({ searchParams }: PageProps<"/activate">) {
  const params = await searchParams;
  const qrId = extractQrId(typeof params.qr === "string" ? params.qr : "") ?? "";

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Activate your QR card</h1>
        <p className="mt-2 text-sm text-muted">
          Enter your details, scan the card you received, and pick where customers should land.
        </p>
      </header>

      <div className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <ActivationForm initialQrId={qrId} />
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        Need help? Contact the business that supplied your card.
      </p>
    </main>
  );
}
