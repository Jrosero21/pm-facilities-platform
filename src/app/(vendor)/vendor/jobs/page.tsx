import { requireVendor } from "@/server/auth-context";
import { listVendorAssignments } from "@/server/vendor/list-assigned-jobs";

/**
 * Vendor jobs list — Phase 10 batch 10j.
 *
 * Replaces the 10i empty-state stub with the real assignment list. Uses
 * listVendorAssignments(tenantId, vendorScope) to surface non-DRAFT
 * assignments (DoR-10j.1) for vendors in the user's scope, joined with
 * job + client + location + status fields.
 *
 * Empty-state path preserved: when the reader returns [], the page renders
 * the same dashed-card empty state from 10i. Row detail-link wrapping is
 * intentionally deferred — the vendor job-detail page lands in a later
 * sub-batch.
 */
export default async function VendorJobsPage() {
  const ctx = await requireVendor();
  const rows = await listVendorAssignments(
    ctx.activeTenant.tenantId,
    ctx.vendorScope,
  );

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Assigned jobs</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Jobs assigned to your vendor organization(s) in the current tenant.
      </p>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-neutral-700">No assigned jobs</p>
          <p className="mt-1 text-xs text-neutral-500">
            When a dispatcher assigns work to one of your {ctx.vendorScope.size}{" "}
            vendor{ctx.vendorScope.size === 1 ? "" : "s"}, it will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Job #</th>
                <th className="px-4 py-2 font-medium">Client / Location</th>
                <th className="px-4 py-2 font-medium">Trade</th>
                <th className="px-4 py-2 font-medium">Dispatch status</th>
                <th className="px-4 py-2 font-medium">Scheduled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((row) => (
                <tr key={row.assignmentId} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 font-medium text-neutral-900">
                    #{row.jobNumber}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    <div className="text-neutral-900">{row.clientName}</div>
                    <div className="text-xs text-neutral-500">
                      {row.locationName}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    {row.matchedTradeName}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    {row.dispatchStatusName}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    {row.scheduledStartAt
                      ? new Date(row.scheduledStartAt).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
