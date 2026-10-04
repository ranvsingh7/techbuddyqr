import Link from "next/link";
import { notFound } from "next/navigation";
import { getTemplate } from "@/services/template";
import { listQrCodes } from "@/services/qr-query";
import { Card, CardHeader, buttonClass } from "@/components/ui";
import { TemplateEditForm } from "@/components/template-edit-form";
import { DesignBatch, type DesignBatchQr } from "@/components/design-batch";
import { dbConnect } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Template" };

const BATCH_POOL_SIZE = 200;

export default async function AdminTemplatePage({ params }: PageProps<"/admin/templates/[id]">) {
  await dbConnect();
  const template = await getTemplate((await params).id);
  if (!template) notFound();

  const templateId = String(template._id);
  const { items } = await listQrCodes({ page: 1, limit: BATCH_POOL_SIZE });

  const candidates: DesignBatchQr[] = items.map((item) => ({
    qrId: item.qrId,
    status: item.status,
    type: item.type,
    businessName: item.merchant?.businessName ?? null,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/templates" className={buttonClass.link}>
            ← All templates
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{template.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {template.imageWidth} × {template.imageHeight} px · QR {template.overlay.qr.size} × {template.overlay.qr.size} px · ID text{" "}
            {template.overlay.text.fontSize} px
          </p>
        </div>
      </header>

      <TemplateEditForm
        template={{
          id: templateId,
          name: template.name,
          type: template.type,
          lightPlate: template.lightPlate,
          imageUrl: `/api/admin/templates/${templateId}/image`,
          imageWidth: template.imageWidth,
          imageHeight: template.imageHeight,
          overlay: template.overlay,
        }}
      />

      <Card>
        <CardHeader
          title="Bulk design generation"
          description="Pick QR codes, preview one design each, then download everything as a ZIP."
        />
        <div className="px-5 pb-5">
          <DesignBatch templateId={templateId} candidates={candidates} />
        </div>
      </Card>
    </div>
  );
}
