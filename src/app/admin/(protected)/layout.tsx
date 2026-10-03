import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/auth/session";
import { dbConnect } from "@/lib/db";
import { LogoutButton } from "@/components/logout-button";
import { AdminNav } from "@/components/admin-nav";

export const dynamic = "force-dynamic";

/** Belt and braces alongside /robots.txt: never let an admin screen be indexed. */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/** Every page inside this group requires a valid admin session. */
export default async function ProtectedAdminLayout({ children }: LayoutProps<"/admin">) {
  if (!(await getSession())) redirect("/admin/login");

  const databaseReachable = await dbConnect()
    .then(() => true)
    .catch(() => false);

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin" className="text-sm font-semibold tracking-tight">
            QR Business Manager
          </Link>
          <LogoutButton />
        </div>
      </header>

      {!databaseReachable ? (
        <div className="mx-auto w-full max-w-2xl px-4 py-10">
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Cannot reach MongoDB.</p>
            <p className="mt-1">Check that the database is running and MONGODB_URI is correct.</p>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row">
          <AdminNav />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      )}
    </>
  );
}
