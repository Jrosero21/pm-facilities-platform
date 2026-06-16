import Link from "next/link";
import { requireTenant } from "@/server/auth-context";
import { listJobs, resolveJobsFilters, type JobListItem } from "@/server/jobs";
import { canSeeFinancials } from "@/server/role-predicates";
import { getJobStatusByCode } from "@/server/job-reference";
import { getReadyToBillRows, type ReadyToBillRow } from "@/server/analytics/ready-to-bill";
import { listClients } from "@/server/clients";
import { billJobAction } from "@/app/(app)/jobs/bill-actions";

// (9e) searchParams is async (a Promise) per Next 15 — first searchParams-driven route in the app
// (manifest §6 establishes the convention). ?status= / ?priority= / ?client= carry validated entity
// ids (the dashboard's status/priority cards link here); invalid ids fall through to an unfiltered
// dimension. CF-27.16 Piece 2 adds the canSeeFinancials-gated "Ready to invoice" view: a quick-view
// chip sets ?status=PENDING_INVOICE, reveals a client filter, and appends billing columns — additive,
// the base list is untouched for everyone else.
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; client?: string }>;
}) {
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;
  const params = await searchParams;
  const filters = await resolveJobsFilters(tenantId, params);
  const isFiltered =
    filters.statusId !== undefined || filters.priorityId !== undefined || filters.clientId !== undefined;

  // CF-27.16 Piece 2 — the financial "Ready to invoice" view is active when an accounting/admin user
  // has the PENDING_INVOICE status filter on. Otherwise the base list renders exactly as before.
  const showFin = canSeeFinancials(ctx);
  const pendingInvoiceId = (await getJobStatusByCode("PENDING_INVOICE"))?.id;
  const activeReadyToBill = showFin && !!pendingInvoiceId && filters.statusId === pendingInvoiceId;

  const rtbRows = activeReadyToBill ? await getReadyToBillRows(tenantId, { clientId: filters.clientId }) : [];
  const clientsForPicker = activeReadyToBill ? await listClients(tenantId) : [];
  const jobs: (JobListItem | ReadyToBillRow)[] = activeReadyToBill ? rtbRows : await listJobs(tenantId, filters);

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

      {/* CF-27.16 Piece 2 — "Ready to invoice" quick-view chip (financial users only; the first named
          view — minimal, not a framework). Mirrors how the dashboard status cards link with ?status=. */}
      {showFin && pendingInvoiceId && (
        <div className="mt-4 flex items-center gap-2">
          <Link
            href={`/jobs?status=${pendingInvoiceId}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              activeReadyToBill
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-700 hover:border-neutral-500"
            }`}
          >
            Ready to invoice
          </Link>
          {activeReadyToBill && (
            <Link href="/jobs" className="text-xs text-neutral-500 underline hover:no-underline">
              Exit view
            </Link>
          )}
        </div>
      )}

      {/* RTB client filter — a plain GET form (no client JS; RSC-safe). "All clients" clears ?client=. */}
      {activeReadyToBill && (
        <form method="get" action="/jobs" className="mt-3 flex items-center gap-2 text-sm">
          <input type="hidden" name="status" value={pendingInvoiceId} />
          <label className="text-neutral-600">Client</label>
          <select
            name="client"
            defaultValue={filters.clientId ?? ""}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm"
          >
            <option value="">All clients</option>
            {clientsForPicker.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500"
          >
            Filter
          </button>
        </form>
      )}

      {isFiltered && !activeReadyToBill && (
        <p className="mt-2 text-sm text-neutral-600">
          Showing {jobs.length} filtered {jobs.length === 1 ? "job" : "jobs"}.{" "}
          <Link href="/jobs" className="text-neutral-900 underline hover:no-underline">
            Clear filters
          </Link>
        </p>
      )}

      {jobs.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">
          {activeReadyToBill
            ? "No jobs are ready to invoice right now."
            : isFiltered
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
                {/* CF-27.16 Piece 2 — billing columns, only in the financial Ready-to-invoice view */}
                {activeReadyToBill && (
                  <>
                    <th className="px-4 py-2 font-medium">Handoff</th>
                    <th className="px-4 py-2 font-medium">Cost</th>
                    <th className="px-4 py-2 font-medium">Billed</th>
                    <th className="px-4 py-2 font-medium">Margin</th>
                    <th className="px-4 py-2 font-medium">Vendors</th>
                    <th className="px-4 py-2 font-medium">Bill</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2">
                    <Link href={`/jobs/${j.id}`} className="font-medium text-neutral-900 hover:underline">
                      #{j.jobNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{j.clientName}</td>
                  <td className="px-4 py-2 text-neutral-600">{j.locationName}</td>
                  <td className="px-4 py-2 text-neutral-600">{j.statusName}</td>
                  <td className="px-4 py-2 text-neutral-600">{j.priorityName ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">{j.createdAt.toLocaleDateString()}</td>
                  {activeReadyToBill && (
                    <>
                      <td className="px-4 py-2 text-neutral-600">
                        {(j as ReadyToBillRow).handoffAt
                          ? (j as ReadyToBillRow).handoffAt!.toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-neutral-600">${(j as ReadyToBillRow).cost}</td>
                      <td className="px-4 py-2 text-neutral-600">${(j as ReadyToBillRow).billedSoFar}</td>
                      <td className="px-4 py-2 text-neutral-600">${(j as ReadyToBillRow).margin}</td>
                      <td className="px-4 py-2 text-neutral-600">{(j as ReadyToBillRow).vendorCount}</td>
                      <td className="px-4 py-2">
                        {/* CF-27.16 Piece 3 — job-first "Bill this job": creates a pre-filled draft. */}
                        <form action={billJobAction.bind(null, j.id)}>
                          <button
                            type="submit"
                            className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500"
                          >
                            Bill
                          </button>
                        </form>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
