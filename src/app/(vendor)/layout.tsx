import type { ReactNode } from "react";
import Link from "next/link";
import { requireVendor } from "@/server/auth-context";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * Vendor portal layout.
 *
 * Calls requireVendor() — redirects to /vendor-no-access if not a vendor
 * user or if scope is empty. Resolves vendor scope once at the layout
 * level; nested pages re-call requireVendor() (idempotent and cheap)
 * when they need ctx.
 *
 * Header shape mirrors (app)/layout.tsx: brand + scope chip + email +
 * sign-out. Nav is vendor-portal-scoped: Jobs / Profile. (Invoices link
 * lands in 10k when the form ships.)
 *
 * Phase 10 batch 10i.
 */
export default async function VendorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await requireVendor();
  const scopeCount = ctx.vendorScope.size;

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/vendor/jobs" className="font-semibold">
              Vendor Portal
            </Link>
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
              {scopeCount} {scopeCount === 1 ? "vendor" : "vendors"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-600">{ctx.user.email}</span>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl items-center gap-4 px-6 pb-2 text-sm">
          <Link
            href="/vendor/jobs"
            className="text-neutral-600 hover:text-neutral-900"
          >
            Jobs
          </Link>
          <Link
            href="/vendor/profile"
            className="text-neutral-600 hover:text-neutral-900"
          >
            Profile
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
