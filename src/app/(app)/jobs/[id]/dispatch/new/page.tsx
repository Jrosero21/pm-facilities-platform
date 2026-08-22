import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getJobDetail } from "@/server/jobs";
import { findCandidateVendorsForJob } from "@/server/vendor-matching";
import { listVendorLocations } from "@/server/vendor-locations";
import { listVendorContacts } from "@/server/vendor-contacts";
import { NewDispatchForm, type DispatchCandidate } from "@/components/new-dispatch-form";
import { toZonedInputValue } from "@/lib/datetime";
import { getJobSiteTimeZone } from "@/server/site-timezone";
import { getAssignmentDetail } from "@/server/dispatch";

/**
 * "Tomorrow at 9am AT THE SITE" as a datetime-local value.
 *
 * The previous version used the host's date getters, which on the server is the deploy region's
 * zone (UTC on Vercel) — so "tomorrow" could already be today, or two days out, depending on the
 * hour the page was rendered. Deriving the date from the site's own wall clock makes the default
 * mean what it says wherever it runs.
 */
function tomorrowAt9(timeZone: string): string {
  const todayAtSite = toZonedInputValue(new Date(), timeZone).slice(0, 10); // YYYY-MM-DD
  const [y, m, d] = todayAtSite.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)); // UTC arithmetic on a bare calendar date
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T09:00`;
}

export default async function NewDispatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** Gap 5: ?replaces={assignmentId} arrives here after a vendor cancellation. */
  searchParams: Promise<{ replaces?: string }>;
}) {
  const { id } = await params;
  const { replaces } = await searchParams;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  // ── Gap 5 — RE-DERIVE the carry-forward from the replaced assignment ────────────────
  // Deliberately re-read rather than accepting scope/NTE/schedule as query params: one source of
  // truth, nothing an operator can accidentally (or deliberately) edit in the address bar, and no
  // stale values if the assignment changed between the cancellation and this page loading.
  // Scoped by tenant, so a replaces= id from another tenant simply resolves to null and the form
  // renders as an ordinary new dispatch.
  const replaced = replaces ? await getAssignmentDetail(tenantId, replaces) : null;

  const job = await getJobDetail(tenantId, id);
  if (!job) notFound();

  // The zone the form renders AND parses in — createDispatchAction resolves the same value
  // server-side, so the typed wall clock means the same instant on both ends.
  const siteTimeZone = await getJobSiteTimeZone(tenantId, id);

  const crumb = (
    <div className="text-sm text-neutral-500">
      <Link href="/jobs" className="hover:text-neutral-900">
        Jobs
      </Link>{" "}
      /{" "}
      <Link href={`/jobs/${id}`} className="hover:text-neutral-900">
        #{job.jobNumber}
      </Link>{" "}
      / Dispatch
    </div>
  );

  // A job with no trade can't be matched/dispatched (the matcher needs a trade).
  if (!job.primaryTradeId) {
    return (
      <div>
        {crumb}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Dispatch a vendor</h1>
        <p className="mt-6 text-sm text-neutral-600">
          This job has no trade assigned. Assign a trade before dispatching a vendor.
        </p>
      </div>
    );
  }

  // MANUAL dispatch = geo is a search-aid, not a hard filter: out-of-area vendors appear (labeled),
  // in-area first. The autonomy floor is untouched (auto-dispatch passes no geoMode → enforce).
  const allCandidates = await findCandidateVendorsForJob(tenantId, id, { geoMode: "search" });

  // ★ Gap 5 — ON A RE-DISPATCH, DROP THE VENDOR WHO JUST CANCELLED.
  // The whole reason this form is open is that they pulled out; offering them back as the ranked
  // best candidate (which they often are, on trade and geo) invites re-dispatching straight to the
  // vendor who cancelled an hour ago. Filtering here rather than in the matcher keeps
  // findCandidateVendorsForJob honest for every other caller — this is a UI-level exclusion for one
  // specific flow, not a change to what "eligible" means.
  const candidates = replaced
    ? allCandidates.filter((c) => c.vendorId !== replaced.vendorId)
    : allCandidates;

  // Distinguish "no vendor covers this trade" from "the only one who does is the one who
  // cancelled" — the second is a different problem with a different fix.
  const onlyCandidateWasCancelled =
    replaced !== null && candidates.length === 0 && allCandidates.length > 0;

  if (candidates.length === 0) {
    return (
      <div>
        {crumb}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Dispatch a vendor</h1>
        <div className="mt-6 max-w-xl rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-sm font-medium text-neutral-900">
            {onlyCandidateWasCancelled
              ? "No other vendor matches this job."
              : "No vendors match this job."}
          </p>
          {onlyCandidateWasCancelled ? (
            <p className="mt-2 text-sm text-neutral-600">
              The only vendor with active <span className="font-medium">{job.tradeName}</span>{" "}
              coverage for this client is the one that just cancelled. Add coverage on another
              vendor, or dispatch this one again from the job page if they can now attend.
            </p>
          ) : (
          <p className="mt-2 text-sm text-neutral-600">
            To dispatch, a vendor needs active{" "}
            <span className="font-medium">{job.tradeName}</span> coverage and must not be
            blocked for this client. Out-of-area vendors are shown (labeled) and can still be
            dispatched — so an empty list means no vendor has this trade. Add coverage on a
            vendor, or change the job&apos;s trade.
          </p>
          )}
          <div className="mt-4">
            <Link
              href={`/jobs/${id}`}
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              ← Back to job
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Enrich each candidate with its active branches + contacts (for the dependent
  // pickers + pre-fill). Candidate sets are small (vendors matching one job).
  const enriched: DispatchCandidate[] = await Promise.all(
    candidates.map(async (c) => {
      const [locations, contacts] = await Promise.all([
        listVendorLocations(tenantId, c.vendorId),
        listVendorContacts(tenantId, c.vendorId),
      ]);
      return {
        vendorId: c.vendorId,
        vendorName: c.vendorName,
        vendorType: c.vendorType,
        primaryTradeMatch: c.primaryTradeMatch,
        tightestGeoMatch: c.tightestGeoMatch,
        inServiceArea: c.inServiceArea,
        complianceStatus: c.complianceStatus,
        locations: locations.map((l) => ({ id: l.id, name: l.name })),
        contacts: contacts.map((ct) => ({
          id: ct.id,
          name: ct.name,
          isPrimary: ct.isPrimary,
        })),
      };
    }),
  );

  // Scope pre-fill fallback chain: approved → current scope → problem description.
  // When neither scope field is set we fall back to the problem statement so the
  // textarea is never blank, and flag it so the label tells the operator that what
  // is pre-filled is the customer's problem, not a real technician scope.
  const scopeSnapshot = job.approvedScopeOfWork ?? job.scopeOfWork ?? null;
  const scopeFromProblem = scopeSnapshot === null;
  const defaultScope = scopeSnapshot ?? job.problemDescription ?? "";
  // Distinct from scopeFromProblem: the vendor gets no human-approved scope even when a
  // raw scopeOfWork exists. Advisory only — dispatch is never gated on approved scope.
  const noApprovedScope = job.approvedScopeOfWork == null;

  return (
    <div>
      {crumb}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Dispatch a vendor</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Job #{job.jobNumber} · {job.tradeName} · {job.locationName}
      </p>
      <div className="mt-6">
        <NewDispatchForm
          jobId={id}
          tradeName={job.tradeName ?? ""}
          candidates={enriched}
          defaultScope={replaced?.dispatchScope ?? defaultScope}
          scopeFromProblem={scopeFromProblem}
          noApprovedScope={noApprovedScope}
          defaultScheduledStart={
            replaced?.scheduledStartAt
              ? toZonedInputValue(replaced.scheduledStartAt, siteTimeZone)
              : tomorrowAt9(siteTimeZone)
          }
          siteTimeZone={siteTimeZone}
          defaultNte={replaced?.agreedNteAmount ?? undefined}
          replacesAssignmentId={replaced ? replaced.id : null}
        />
      </div>
    </div>
  );
}
