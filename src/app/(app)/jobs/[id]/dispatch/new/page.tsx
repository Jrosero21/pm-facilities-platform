import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getJobDetail } from "@/server/jobs";
import { findCandidateVendorsForJob } from "@/server/vendor-matching";
import { listVendorLocations } from "@/server/vendor-locations";
import { listVendorContacts } from "@/server/vendor-contacts";
import { NewDispatchForm, type DispatchCandidate } from "@/components/new-dispatch-form";

function tomorrowAt9(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

export default async function NewDispatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  const job = await getJobDetail(tenantId, id);
  if (!job) notFound();

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

  const candidates = await findCandidateVendorsForJob(tenantId, id);

  if (candidates.length === 0) {
    return (
      <div>
        {crumb}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Dispatch a vendor</h1>
        <div className="mt-6 max-w-xl rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-sm font-medium text-neutral-900">No vendors match this job.</p>
          <p className="mt-2 text-sm text-neutral-600">
            To dispatch, a vendor needs active{" "}
            <span className="font-medium">{job.tradeName}</span> coverage and a service
            area covering this job&apos;s location ({job.locationName}). Add coverage on a
            vendor, or change the job&apos;s trade.
          </p>
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
          defaultScope={defaultScope}
          scopeFromProblem={scopeFromProblem}
          defaultScheduledStart={tomorrowAt9()}
        />
      </div>
    </div>
  );
}
