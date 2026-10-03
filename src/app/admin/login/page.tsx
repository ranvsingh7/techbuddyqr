import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/auth/session";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Admin sign in" };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await getSession()) redirect("/admin");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6">
        <h1 className="mb-1 text-lg font-semibold tracking-tight">Admin sign in</h1>
        <p className="mb-6 text-sm text-muted">This area is for the QR Business Manager team.</p>
        <LoginForm />
      </div>
    </main>
  );
}
