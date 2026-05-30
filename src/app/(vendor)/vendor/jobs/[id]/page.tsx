import { notFound } from "next/navigation";
import { requireVendor } from "@/server/auth-context";
import { getVendorAssignmentDetail } from "@/server/vendor/get-vendor-assignment-detail";
import { DispatchStatusBadge } from "@/components/dispatch-status-badge";
import { VendorActionButton } from "@/components/vendor/vendor-action-button";
import { VendorDeclineForm } from "@/components/vendor/vendor-decline-form";
import { VendorEtaForm } from "@/components/vendor/vendor-eta-form";
import {
  acceptDispatchAction,
  confirmScheduleAction,
  markOnSiteAction,
  markWorkCompleteAction,
} from "@/app/(vendor)/vendor/jobs/actions";

/**
 * Vendor assignment detail page.
 *
 * [id] is the assignment id (DoR-10k.5). Vendor-scoped read via
 * getVendorAssignmentDetail (canActOnAssignment guard wrapping the
 * tenant-scoped getAssignmentDetail) — notFound() on null (missing or
 * out-of-scope).
 *
 * Action panel renders per current dispatch status (DoR-10k.2):
 *   SENT          → accept button + decline-with-reason form
 *   ACCEPTED      → confirmEta form (transitions to SCHEDULED, DoR-10k.3)
 *   SCHEDULED     → confirmSchedule button
 *   CONFIRMED     → markOnSite button
 *   ON_SITE       → markWorkComplete button
 *   WORK_COMPLETE / DECLINED / CANCELLED → terminal: closed-state message
 *
 * Phase 10 batch 10k-ui.
 */
export default async function VendorAssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireVendor();
  const detail = await getVendorAssignmentDetail(
    ctx.activeTenant.tenantId,
    id,
    ctx.vendorScope,
  );
  if (!detail) notFound();

  const isTerminal =
    detail.statusCode === "WORK_COMPLETE" ||
    detail.statusCode === "DECLINED" ||
    detail.statusCode === "CANCELLED";

  return (
    <section className="space-y-8">
      <header>
        <p className="font-mono text-sm text-neutral-500">#{detail.jobNumber}</p>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {detail.vendorName}
          </h1>
          <DispatchStatusBadge
            category={detail.statusCategory}
            label={detail.statusName}
          />
        </div>
        <p className="mt-1 text-sm text-neutral-600">
          {detail.matchedTradeName}
          {detail.scheduledStartAt
            ? ` · Scheduled ${new Date(detail.scheduledStartAt).toLocaleString()}`
            : ""}
        </p>
        {detail.dispatchScope && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-700">
            {detail.dispatchScope}
          </p>
        )}
      </header>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Actions
        </h2>
        <div className="mt-4">
          {detail.statusCode === "SENT" && (
            <div className="space-y-4">
              <VendorActionButton
                boundAction={acceptDispatchAction.bind(null, detail.id)}
                label="Accept dispatch"
                pendingLabel="Accepting…"
              />
              <VendorDeclineForm assignmentId={detail.id} />
            </div>
          )}
          {detail.statusCode === "ACCEPTED" && (
            <VendorEtaForm assignmentId={detail.id} />
          )}
          {detail.statusCode === "SCHEDULED" && (
            <VendorActionButton
              boundAction={confirmScheduleAction.bind(null, detail.id)}
              label="Confirm schedule"
              pendingLabel="Confirming…"
            />
          )}
          {detail.statusCode === "CONFIRMED" && (
            <VendorActionButton
              boundAction={markOnSiteAction.bind(null, detail.id)}
              label="Mark on-site"
              pendingLabel="Recording…"
            />
          )}
          {detail.statusCode === "ON_SITE" && (
            <VendorActionButton
              boundAction={markWorkCompleteAction.bind(null, detail.id)}
              label="Mark work complete"
              pendingLabel="Completing…"
            />
          )}
          {isTerminal && (
            <p className="text-sm text-neutral-600">
              This assignment is closed. No further actions are available.
            </p>
          )}
        </div>
      </section>
    </section>
  );
}
