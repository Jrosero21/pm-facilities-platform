import type { ReactNode } from "react";
import Link from "next/link";
import { requireClient } from "@/server/auth-context";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * Client portal layout.
 *
 * Calls requireClient() — redirects to /client-no-access if not a client user
 * or if scope is empty. Resolves client scope once at the layout level; nested
 * pages re-call requireClient() (idempotent and cheap) when they need ctx.
 *
 * Header shape mirrors (vendor)/layout.tsx: brand + scope chip + email +
 * sign-out. Nav: Jobs / Locations / Invoices. Locations (11h) and Invoices
 * (11i) routes do not exist yet — the links are authored up front (vendor
 * precedent) and 404 until those sub-batches land.
 *
 * Phase 11 batch 11d.
 */
export default async function ClientLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await requireClient();
  const scopeCount = ctx.clientScope.size;

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/client/jobs" className="font-semibold">
              Client Portal
            </Link>
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
              {scopeCount} {scopeCount === 1 ? "client" : "clients"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-600">{ctx.user.email}</span>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl items-center gap-4 px-6 pb-2 text-sm">
          <Link
            href="/client/jobs"
            className="text-neutral-600 hover:text-neutral-900"
          >
            Jobs
          </Link>
          <Link
            href="/client/locations"
            className="text-neutral-600 hover:text-neutral-900"
          >
            Locations
          </Link>
          <Link
            href="/client/invoices"
            className="text-neutral-600 hover:text-neutral-900"
          >
            Invoices
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
