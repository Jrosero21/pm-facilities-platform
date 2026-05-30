import { requireVendor } from "@/server/auth-context";

/**
 * Vendor jobs list — Phase 10 batch 10i empty-state stub.
 *
 * The full list reader and table land in a later sub-batch (10j) when
 * the assignment-scoped query is authored. This stub establishes the
 * route, the layout integration, and the empty-state copy.
 *
 * No assigned jobs exist yet because no job_vendor_assignments are
 * tied to vendors in the current user's scope (empty seed; future
 * sub-batch extends the Phase 9 seed with vendor_users rows).
 */
export default async function VendorJobsPage() {
  const ctx = await requireVendor();

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Assigned jobs</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Jobs assigned to your vendor organization(s) in the current tenant.
      </p>
      <div className="mt-8 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-6 py-12 text-center">
        <p className="text-sm font-medium text-neutral-700">No assigned jobs</p>
        <p className="mt-1 text-xs text-neutral-500">
          When a dispatcher assigns work to one of your {ctx.vendorScope.size}{" "}
          vendor{" "}
          {ctx.vendorScope.size === 1 ? "organization" : "organizations"}, it
          will appear here.
        </p>
      </div>
    </section>
  );
}
