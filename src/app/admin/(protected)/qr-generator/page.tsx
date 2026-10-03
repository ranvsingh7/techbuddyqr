import { BulkGenerator } from "@/components/bulk-generator";

export const metadata = { title: "Generate QR codes" };

export default function AdminQrGeneratorPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Generate QR</h1>
        <p className="mt-0.5 text-sm text-muted">
          Create QR IDs in bulk. They stay unassigned until a shop activates one.
        </p>
      </header>

      <BulkGenerator />
    </div>
  );
}
