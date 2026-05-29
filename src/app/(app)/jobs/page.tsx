import Link from "next/link";
import { requireTenant } from "@/server/auth-context";
import { listJobs, resolveJobsFilters } from "@/server/jobs";

// (9e) searchParams is async (a Promise) per Next 15 — first searchParams-driven route in the app
// (manifest §6 establishes the convention). ?status= / ?priority= carry validated entity ids (the
// dashboard's status/priority cards link here); invalid ids fall through to an unfiltered dimension.
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;
  const params = await searchParams;
  const filters = await resolveJobsFilters(tenantId, params);
  const isFiltered = filters.statusId !== undefined || filters.priorityId !== undefined;
  const jobs = await listJobs(tenantId, filters);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <Link
          href="/jobs/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New job
        </Link>
      </div>

      {isFiltered && (
        <p className="mt-2 text-sm text-neutral-600">
          Showing {jobs.length} filtered {jobs.length === 1 ? "job" : "jobs"}.{" "}
          <Link href="/jobs" className="text-neutral-900 underline hover:no-underline">
            Clear filters
          </Link>
        </p>
      )}

      {jobs.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">
          {isFiltered
            ? "No jobs match the current filter."
            : "No jobs yet. Create the first one to get started."}
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Job #</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/jobs/${j.id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      #{j.jobNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{j.clientName}</td>
                  <td className="px-4 py-2 text-neutral-600">{j.locationName}</td>
                  <td className="px-4 py-2 text-neutral-600">{j.statusName}</td>
                  <td className="px-4 py-2 text-neutral-600">{j.priorityName ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {j.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
