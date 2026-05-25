import Link from "next/link";
import { requireTenant } from "@/server/auth-context";
import { listJobs } from "@/server/jobs";

export default async function JobsPage() {
  const ctx = await requireTenant();
  const jobs = await listJobs(ctx.activeTenant.tenantId);

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

      {jobs.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">
          No jobs yet. Create the first one to get started.
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
