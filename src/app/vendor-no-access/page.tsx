import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * Vendor portal no-access page.
 *
 * Redirect target for requireVendor when:
 *   - user is not a vendor_user
 *   - user is a vendor_user but has no vendor_users mapping rows for
 *     the active tenant (empty scope)
 *
 * Top-level (outside both (app) and (vendor) groups) to avoid recursive
 * guard redirects. Mirrors /forbidden and /no-tenant convention.
 *
 * Phase 10 batch 10i.
 */
export default function VendorNoAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Vendor portal not available
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        Your account doesn&rsquo;t have vendor access in the current tenant. If
        you believe this is in error, contact your administrator.
      </p>
      <div className="mt-6 flex items-center justify-center gap-4">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-neutral-900 underline underline-offset-4"
        >
          Go to dashboard
        </Link>
        <SignOutButton />
      </div>
    </main>
  );
}
