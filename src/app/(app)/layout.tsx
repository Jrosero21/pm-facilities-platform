import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { requireAuth } from "@/server/auth-context";
import { isVendorUser, canSeeOperations } from "@/server/role-predicates";
import { getVendorScope } from "@/server/vendor-scope";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireAuth();

  // Phase 10 batch 10i — post-login role-routing shim.
  // Vendor users with at least one vendor mapping in the active tenant
  // belong in the vendor portal, not the aggregator dashboard. Dual-role
  // users (operator + vendor_user) default to the aggregator portal since
  // they have aggregator access; explicit vendor-portal entry is via direct
  // nav (FB-10i.1 banks the switcher UI).
  if (ctx.activeTenant && isVendorUser(ctx) && !canSeeOperations(ctx)) {
    const vendorScope = await getVendorScope(
      ctx.user.id,
      ctx.activeTenant.tenantId,
    );
    if (vendorScope.size > 0) {
      redirect("/vendor/jobs");
    } else {
      redirect("/vendor-no-access");
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="font-semibold">PM Facilities</span>
            {ctx.activeTenant && (
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                {ctx.activeTenant.tenantName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-600">{ctx.user.email}</span>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl items-center gap-4 px-6 pb-2 text-sm">
          <Link href="/dashboard" className="text-neutral-600 hover:text-neutral-900">
            Dashboard
          </Link>
          <Link href="/clients" className="text-neutral-600 hover:text-neutral-900">
            Clients
          </Link>
          <Link href="/vendors" className="text-neutral-600 hover:text-neutral-900">
            Vendors
          </Link>
          <Link href="/jobs" className="text-neutral-600 hover:text-neutral-900">
            Jobs
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
