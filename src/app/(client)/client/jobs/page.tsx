import Link from "next/link";
import { requireClient } from "@/server/auth-context";
import { listClientJobs } from "@/server/client/list-client-jobs";

/**
 * Client jobs (work orders) list — Phase 11 batch 11d.
 *
 * requireClient() → listClientJobs(tenantId, clientScope): the client's own jobs
 * (jobs.client_id IN scope, non-archived), client-safe columns only. Mirrors the
 * (vendor)/vendor/jobs list shape; job-primary (no assignment join). Row job
 * number links to /client/jobs/[id] (detail page lands in 11e).
 *
 * Empty-state preserved when the reader returns [].
 */
export default async function ClientJobsPage() {
  const ctx = await requireClient();
  const rows = await listClientJobs(
    ctx.activeTenant.tenantId,
    ctx.clientScope,
  );

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Work orders</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Work orders for your organization(s) in the current tenant.
      </p>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-neutral-700">No work orders yet</p>
          <p className="mt-1 text-xs text-neutral-500">
            Work orders you submit will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Job #</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 font-medium">
                    <Link
                      href={`/client/jobs/${row.id}`}
                      className="text-neutral-900 hover:underline"
                    >
                      #{row.jobNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    {row.problemDescription.length > 80
                      ? `${row.problemDescription.slice(0, 80)}…`
                      : row.problemDescription}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{row.statusName}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {row.locationName}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    {row.createdAt.toLocaleDateString()}
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
