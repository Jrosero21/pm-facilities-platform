import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getAssignmentDetail } from "@/server/dispatch";
import { listActiveDispatchStatuses } from "@/server/dispatch-reference";
import { DispatchStatusBadge } from "@/components/dispatch-status-badge";
import { SendDispatchButton } from "@/components/send-dispatch-button";
import { DispatchStatusPicker } from "@/components/dispatch-status-picker";
import { VendorLinkSection } from "@/components/vendor-link-section";
import { getVendorContact } from "@/server/vendor-contacts";
import { listAssignmentTokens } from "@/server/magic-links/list-assignment-tokens";
import {
  complianceLabel,
  geoMatchLabel,
  tradeMatchLabel,
} from "@/components/dispatch-facets";

function fmt(d: Date | null): string {
  return d ? d.toLocaleString() : "—";
}

/** matched_geo_types_at_dispatch is JSON (longtext on MariaDB) — parse defensively. */
function geoTypes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string }>;
}) {
  const { id, assignmentId } = await params;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  const a = await getAssignmentDetail(tenantId, assignmentId);
  // Guard: assignment must exist AND belong to the job in the URL.
  if (!a || a.jobId !== id) notFound();

  // Vendor-link controls: is there a deliverable recipient email, and the existing tokens.
  const recipientEmail = a.vendorContactId
    ? (await getVendorContact(tenantId, a.vendorContactId))?.email ?? null
    : null;
  const linkTokens = await listAssignmentTokens(tenantId, assignmentId);

  // Operator hand-advance options: every active status EXCEPT DRAFT/SENT (Send-button territory)
  // and the assignment's current status (no same-status pick). The server action backstops the guard.
  const statusOptions = (await listActiveDispatchStatuses())
    .filter((s) => s.code !== "DRAFT" && s.code !== "SENT" && s.code !== a.statusCode)
    .map((s) => ({ code: s.code, name: s.name }));

  const facts: { label: string; value: string | null }[] = [
    { label: "Vendor", value: a.vendorName },
    { label: "Branch", value: a.vendorLocationName ?? "Vendor-wide (no branch)" },
    { label: "Vendor contact", value: a.vendorContactName },
    { label: "Scheduled start", value: fmt(a.scheduledStartAt) },
    { label: "Scheduled end", value: fmt(a.scheduledEndAt) },
    { label: "Agreed NTE", value: a.agreedNteAmount ? `$${a.agreedNteAmount}` : null },
  ];

  const branchCoverage =
    a.chosenBranchCoveredTrade === null
      ? "n/a (vendor-wide dispatch)"
      : a.chosenBranchCoveredTrade
        ? "Yes — the chosen branch carries this trade"
        : "No — the chosen branch does not carry this trade itself";

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href="/jobs" className="hover:text-neutral-900">
          Jobs
        </Link>{" "}
        /{" "}
        <Link href={`/jobs/${id}`} className="hover:text-neutral-900">
          #{a.jobNumber}
        </Link>{" "}
        / Dispatch
      </div>

      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Dispatch to {a.vendorName}
        </h1>
        <DispatchStatusBadge category={a.statusCategory} label={a.statusName} />
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{f.label}</dt>
            <dd className="mt-1 text-sm font-medium">{f.value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      {/* Facet snapshot — the audit story of why this vendor was matched at dispatch */}
      <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
        <dt className="text-xs uppercase tracking-wide text-neutral-500">
          Match at dispatch
        </dt>
        <ul className="mt-2 space-y-1 text-sm text-neutral-800">
          <li>{tradeMatchLabel(a.matchedTradeName, a.matchedTradeWasPrimary)}</li>
          <li>
            {geoMatchLabel(a.tightestGeoAtDispatch)}
            {geoTypes(a.matchedGeoTypesAtDispatch).length > 0 && (
              <span className="text-neutral-500">
                {" "}
                (matched: {geoTypes(a.matchedGeoTypesAtDispatch).join(", ")})
              </span>
            )}
          </li>
          <li>
            Compliance at dispatch: {complianceLabel(a.complianceStatusAtDispatch)}
          </li>
          <li>Chosen-branch coverage: {branchCoverage}</li>
        </ul>
      </div>

      {a.dispatchScope && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">
            Dispatch scope
          </dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">
            {a.dispatchScope}
          </dd>
        </div>
      )}

      {a.statusCode === "DRAFT" && (
        <div className="mt-6">
          <SendDispatchButton assignmentId={assignmentId} />
          <p className="mt-2 text-xs text-neutral-500">
            Sending notifies the vendor and moves the job to Dispatched (if it was
            New or Scheduled).
          </p>
        </div>
      )}

      {/* Operator hand-advance — set the dispatch status when a vendor calls/texts it in (not DRAFT). */}
      {a.statusCode !== "DRAFT" && (
        <div className="mt-6 max-w-sm rounded-lg border border-neutral-200 bg-white p-4">
          <DispatchStatusPicker assignmentId={assignmentId} options={statusOptions} />
        </div>
      )}

      <VendorLinkSection
        jobId={id}
        assignmentId={assignmentId}
        tokens={linkTokens}
        hasRecipientEmail={recipientEmail !== null}
      />
    </div>
  );
}
