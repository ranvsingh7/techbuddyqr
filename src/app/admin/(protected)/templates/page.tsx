import Link from "next/link";
import { listTemplates } from "@/services/template";
import { destinationLabel } from "@/types";
import { Card, EmptyState, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Design templates" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function AdminTemplatesPage() {
  const templates = await listTemplates();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Design Templates</h1>
          <p className="mt-0.5 text-sm text-muted">Reusable artwork with a marked QR area.</p>
        </div>
        <Link href="/admin/templates/new" className={buttonClass.primary}>
          New template
        </Link>
      </header>

      {templates.length === 0 ? (
        <Card>
          <EmptyState title="No templates yet" hint="Upload your first design to print QR cards in bulk." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={String(template._id)} className="overflow-hidden">
              <Link href={`/admin/templates/${template._id}`} className="block border-b border-line bg-canvas p-4">
                <img
                  src={`/api/admin/templates/${template._id}/image`}
                  alt={template.name}
                  width={220}
                  height={280}
                  className="mx-auto max-h-64 w-auto rounded border border-line"
                />
              </Link>

              <div className="space-y-1.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="truncate text-sm font-semibold">{template.name}</h2>
                  {template.type ? (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      {destinationLabel(template.type)}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted">
                  QR {template.overlay.qr.size} px · ID text {template.overlay.text.fontSize} px, rotated {template.overlay.text.rotation}°
                </p>
                <p className="text-xs text-muted">Created {dateFormat.format(new Date(template.createdAt!))}</p>
                <Link href={`/admin/templates/${template._id}`} className={`${buttonClass.secondary} mt-2 w-full`}>
                  Generate designs
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
