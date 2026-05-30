import Link from "next/link";
import { notFound } from "next/navigation";
import { requireVendor } from "@/server/auth-context";
import { getVendorAssignmentDetail } from "@/server/vendor/get-vendor-assignment-detail";
import { listVendorAssignmentNotes } from "@/server/vendor/list-assignment-notes";
import { listVendorAssignmentAttachments } from "@/server/vendor/list-assignment-attachments";
import { listVendorAssignmentInvoices } from "@/server/vendor/list-assignment-invoices";
import { DispatchStatusBadge } from "@/components/dispatch-status-badge";
import { NoteVisibilityBadge } from "@/components/note-visibility-badge";
import { VendorNoteForm } from "@/components/vendor/vendor-note-form";
import { VendorPhotoPlaceholderForm } from "@/components/vendor/vendor-photo-placeholder-form";
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

  const notes = await listVendorAssignmentNotes(
    ctx.activeTenant.tenantId,
    detail.id,
    ctx.vendorScope,
  );
  const attachments = await listVendorAssignmentAttachments(
    ctx.activeTenant.tenantId,
    detail.id,
    ctx.vendorScope,
  );
  const invoices = await listVendorAssignmentInvoices(
    ctx.activeTenant.tenantId,
    detail.id,
    ctx.vendorScope,
  );

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

      {/* Notes — vendor sees vendor-visible notes + their own org's vendor-origin
          notes (DoR-10l.2 filter, applied in listVendorAssignmentNotes). No origin
          tag rendered here: every note the vendor sees is, by the filter, either
          operator-shared-to-vendor or their own org's — provenance is unambiguous
          in this context (the operator side carries the tag instead). */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Notes
        </h2>
        <div className="mt-4 space-y-3">
          {notes.length === 0 ? (
            <p className="text-sm text-neutral-500">No notes yet.</p>
          ) : (
            notes.map((n) => (
              <div
                key={n.id}
                className="rounded-lg border border-neutral-200 bg-white p-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <NoteVisibilityBadge visibility={n.visibility} />
                  <span className="text-xs text-neutral-500">
                    {n.authorName ?? "Unknown"} ·{" "}
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-neutral-700">
                  {n.body}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="mt-6">
          <VendorNoteForm assignmentId={detail.id} />
        </div>
      </section>

      {/* Photos — metadata-only placeholders (Fork 7): no real file upload yet
          (FB-10a.4). Each row branches on file_url presence so the same render
          works unchanged when a future phase backfills real files. Author-scoped
          read (DoR-10m.1) via listVendorAssignmentAttachments. */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Photos
        </h2>
        <div className="mt-4 space-y-3">
          {attachments.length === 0 ? (
            <p className="text-sm text-neutral-500">No photos attached yet.</p>
          ) : (
            attachments.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-neutral-200 bg-white p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                    {a.fileUrl ? "Uploaded" : "Placeholder"}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {a.authorName ?? "Unknown"} ·{" "}
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-sm text-neutral-700">{a.title}</p>
              </div>
            ))
          )}
        </div>
        <div className="mt-6">
          <VendorPhotoPlaceholderForm assignmentId={detail.id} />
        </div>
      </section>

      {/* Invoices — vendor-submitted invoices for this assignment (vendor_id IN
          scope; explicit assignment_id makes the filter simple). Submission flows
          through Phase 8's recordVendorInvoice; operator AP review is unchanged. */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Invoices
          </h2>
          <Link
            href={`/vendor/jobs/${detail.id}/invoices/new`}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Submit invoice
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {invoices.length === 0 ? (
            <p className="text-sm text-neutral-500">No invoices submitted yet.</p>
          ) : (
            invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    {inv.invoiceNumber ?? "(no invoice #)"}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {new Date(inv.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                    {inv.status}
                  </span>
                  <p className="mt-1 text-sm font-medium text-neutral-900">
                    {inv.currency} {inv.total}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
