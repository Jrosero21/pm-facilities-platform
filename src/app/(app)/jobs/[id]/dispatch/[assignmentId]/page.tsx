import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getAssignmentDetail } from "@/server/dispatch";
import { listActiveDispatchStatuses } from "@/server/dispatch-reference";
import { DispatchStatusBadge } from "@/components/dispatch-status-badge";
import { SendDispatchButton } from "@/components/send-dispatch-button";
import { ApproveRedispatchButton } from "@/components/approve-redispatch-button";
import { WorkOrderActions } from "@/components/work-order-actions";
import { RecordVendorPresence } from "@/components/record-vendor-presence";
import { VendorCancelledButton } from "@/components/vendor-cancelled-button";
import {
  CANCELLABLE_ASSIGNMENT_STATUSES,
  isAgentRedispatchSuggestion,
} from "@/server/redispatch-cancellation-rules";
import { DispatchStatusPicker } from "@/components/dispatch-status-picker";
import { VendorLinkSection } from "@/components/vendor-link-section";
import { getVendorContact } from "@/server/vendor-contacts";
import { listAssignmentTokens } from "@/server/magic-links/list-assignment-tokens";
import {
  complianceLabel,
  geoMatchLabel,
  tradeMatchLabel,
} from "@/components/dispatch-facets";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/format-date";

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

  // Gap 5 — is this DRAFT an AGENT re-dispatch suggestion (replaced assignment still SENT), or an
  // operator cancellation replacement (replaced already DECLINED)? One extra read decides which
  // control set to show. See the note at the DRAFT block below.
  const replacedAssignment = a.replacesAssignmentId
    ? await getAssignmentDetail(tenantId, a.replacesAssignmentId)
    : null;
  const replacedIsStillSent = isAgentRedispatchSuggestion(replacedAssignment?.statusCode);

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
    { label: "Scheduled start", value: formatDateTime(a.scheduledStartAt) },
    { label: "Scheduled end", value: formatDateTime(a.scheduledEndAt) },
    { label: "Agreed NTE", value: a.agreedNteAmount ? formatMoney(a.agreedNteAmount) : null },
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

      {/* Gap 5 — make the chain link VISIBLE. replaces_assignment_id has always been stamped, but
          only analytics could see it: a coordinator opening a replacement had no way to tell it was
          one, or which dispatch it succeeded. Free to render — replacedAssignment is already loaded
          above for the control-set gate. The replaced status is named rather than assumed, so this
          reads truthfully on both paths (DECLINED for an operator cancellation, SENT for an agent
          suggestion the operator has not approved yet). */}
      {replacedAssignment && (
        <p className="mt-2 text-sm text-neutral-600">
          Replaces the dispatch to{" "}
          <Link
            href={`/jobs/${id}/dispatch/${replacedAssignment.id}`}
            className="font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-700"
          >
            {replacedAssignment.vendorName}
          </Link>{" "}
          ({replacedAssignment.statusName.toLowerCase()}).
        </p>
      )}

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{f.label}</dt>
            <dd className="mt-1 text-sm font-medium">{f.value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      {/* FOUNDATION Gap 1 — record what the vendor said when they phone the coordinator. Sits
          beside the work order because both are things an operator DOES here, and above the
          facet snapshot which is read-only history. */}
      <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Vendor updates</p>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <RecordVendorPresence jobId={a.jobId} assignmentId={a.id} />
          {/* Gap 5 — outcome 1(c). Only while the dispatch is live: a cancellation cannot be
              recorded against something already closed, or against a vendor already on site. */}
          {(CANCELLABLE_ASSIGNMENT_STATUSES as readonly string[]).includes(a.statusCode) && (
            <VendorCancelledButton
              jobId={a.jobId}
              assignmentId={a.id}
              vendorName={a.vendorName}
            />
          )}
        </div>
      </div>

      {/* vendor-WO batch 4 — the work order for THIS assignment: view it, or re-send it to the
          vendor. Placed directly under the facts because those are the values the document
          renders, so an operator who has just checked or changed them acts here. */}
      <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Work order</p>
        <div className="mt-2">
          <WorkOrderActions jobId={a.jobId} assignmentId={a.id} />
        </div>
      </div>

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
          {/* ★ Gap 5 — which control set this DRAFT gets is decided by the REPLACED assignment's
              state, never by the mere presence of replacesAssignmentId. Both re-dispatch paths stamp
              that column, so it cannot tell them apart:

                replaced still SENT  → agent suggestion, vendor went silent → Approve (ghosts them)
                replaced DECLINED    → an operator already closed it because the vendor CALLED to
                                       cancel → ordinary Send. Offering to "ghost the unresponsive
                                       vendor" here would libel a vendor who did the right thing, and
                                       approveRedispatch hard-guards STUCK_NO_LONGER_SENT so the
                                       click would throw anyway. */}
          {replacedIsStillSent ? (
            <ApproveRedispatchButton jobId={id} draftAssignmentId={assignmentId} />
          ) : (
            <>
              <SendDispatchButton assignmentId={assignmentId} />
              <p className="mt-2 text-xs text-neutral-500">
                Sending notifies the vendor and moves the job to Dispatched (if it was
                New or Scheduled).
              </p>
            </>
          )}
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
