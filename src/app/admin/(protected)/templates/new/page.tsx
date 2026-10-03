import Link from "next/link";
import { Card, buttonClass } from "@/components/ui";
import { TemplateCreateForm } from "@/components/template-create-form";

export const metadata = { title: "New design template" };

export default function AdminTemplateNewPage() {
  return (
    <div className="space-y-5">
      <header>
        <Link href="/admin/templates" className={buttonClass.link}>
          ← All templates
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">New design template</h1>
        <p className="mt-0.5 text-sm text-muted">Upload one design, then reuse it for as many QR codes as you need.</p>
      </header>

      <Card className="p-5">
        <p className="text-sm text-muted">
          A template holds the artwork and the QR position only. It never assigns a merchant or a destination.
        </p>
      </Card>

      <TemplateCreateForm />
    </div>
  );
}
