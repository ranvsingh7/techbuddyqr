import Link from "next/link";
import { env, qrRedirectUrl } from "@/lib/env";
import { Card, CardHeader, buttonClass } from "@/components/ui";
import { DESTINATION_CONFIG, DESTINATION_TYPES } from "@/types";
import { MAX_BULK_COUNT, MAX_ZIP_COUNT } from "@/validation/schemas";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

export default function AdminSettingsPage() {
  const appUrl = env().appUrl;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-sm text-muted">Configuration for this deployment.</p>
      </header>

      <Card>
        <CardHeader title="Public URLs" description="Everything printed on a card points back at this app." />
        <div className="space-y-4 px-5 py-4 text-sm">
          <div>
            <p className="text-muted">App URL</p>
            <p className="font-mono">{appUrl}</p>
          </div>
          <div>
            <p className="text-muted">Sample QR destination</p>
            <p className="font-mono">{qrRedirectUrl("QRA7K29X4P")}</p>
          </div>
          <div>
            <p className="text-muted">Merchant activation page</p>
            <Link href="/activate" className={buttonClass.link}>
              {appUrl}/activate
            </Link>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Limits" description="Applied server-side so a single request cannot overwhelm the app." />
        <dl className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Max QR codes per batch</dt>
            <dd className="font-medium tabular-nums">{MAX_BULK_COUNT}</dd>
          </div>
          <div>
            <dt className="text-muted">Max designs per ZIP</dt>
            <dd className="font-medium tabular-nums">{MAX_ZIP_COUNT}</dd>
          </div>
          <div>
            <dt className="text-muted">Max template image</dt>
            <dd className="font-medium tabular-nums">{MAX_UPLOAD_BYTES / 1024 / 1024} MB</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader title="Destination types" description="Offered to merchants during activation and filterable in the admin." />
        <ul className="divide-y divide-line px-5 py-2 text-sm">
          {DESTINATION_TYPES.map((type) => (
            <li key={type} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <span className="font-medium">{DESTINATION_CONFIG[type].label}</span>
              <span className="text-muted">{DESTINATION_CONFIG[type].help}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Environment" description="Secrets are read from environment variables and never stored in the database." />
        <ul className="divide-y divide-line px-5 py-2 text-sm">
          {[
            ["MONGODB_URI", "MongoDB connection string"],
            ["NEXT_PUBLIC_APP_URL", "Public base URL encoded in every QR code"],
            ["AUTH_SECRET", "Signs the admin session cookie and salts IP hashes"],
            ["ADMIN_EMAIL", "Admin login email"],
            ["ADMIN_PASSWORD_HASH", "scrypt hash of the admin password"],
            ["STORAGE_DIR", "Folder holding template artwork"],
          ].map(([name, purpose]) => (
            <li key={name} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <span className="font-mono text-[13px]">{name}</span>
              <span className="text-muted">{purpose}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
