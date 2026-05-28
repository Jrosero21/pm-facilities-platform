import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getJobDetail } from "@/server/jobs";
import { listJobContacts } from "@/server/job-contacts";
import { listJobNotes } from "@/server/job-notes";
import { listJobEvents } from "@/server/job-events";
import { listAssignmentsForJob } from "@/server/dispatch";
import { listCommunicationsForJob } from "@/server/communications";
import { listDraftsForJobDetailed } from "@/server/agents/drafts";
import { createJobContactAction } from "@/app/(app)/jobs/contact-actions";
import { createJobNoteAction } from "@/app/(app)/jobs/note-actions";
import { ContactForm } from "@/components/contact-form";
import { ContactList } from "@/components/contact-list";
import { JobNoteForm } from "@/components/job-note-form";
import { NoteVisibilityBadge } from "@/components/note-visibility-badge";
import { DispatchStatusBadge } from "@/components/dispatch-status-badge";
import { facetLine } from "@/components/dispatch-facets";
import { ShareNoteButton } from "@/components/share-note-button";
import { DeliveryStatusBadge } from "@/components/delivery-status-badge";
import { DeliveryTransitionButtons } from "@/components/delivery-transition-buttons";
import { DraftClientUpdateButton } from "@/components/draft-client-update-button";
import { UpdateDraftsSection } from "@/components/update-drafts-section";
import { JobTimeline } from "@/components/job-timeline";
import { mergeTimeline } from "@/lib/timeline";
import { listScopeDraftsForJobDetailed } from "@/server/agents/scope-generator/drafts";
import { listScopeStepsForJob } from "@/server/agents/scope-generator/steps";
import { GenerateScopeButton } from "@/components/generate-scope-button";
import { listProposalsForJob } from "@/server/billing/proposals";
import { listChangeOrdersForJob } from "@/server/billing/change-orders";
import { listVendorInvoicesForJob } from "@/server/billing/vendor-invoices";
import { listClientInvoicesForJob } from "@/server/billing/client-invoices";
import { listPaymentsForJob } from "@/server/billing/payments";
import { getJobMargin } from "@/server/billing/margin";
import { getBillingCloseReadiness } from "@/server/billing/close";
import { listJobBillingEvents } from "@/server/billing/events";
import { BillingSection } from "@/components/billing-section";
import { ProposalList } from "@/components/proposal-list";
import { ChangeOrderList } from "@/components/change-order-list";
import { ScopeDraftsSection } from "@/components/scope-drafts-section";

const sourceLabel: Record<string, string> = {
  manual: "Manual",
  internal_client_portal: "Internal client portal",
  external_client_portal: "External client portal",
  email_ingestion: "Email ingestion",
  forwarded_email: "Forwarded email",
  api: "API",
  preventative_maintenance: "Preventative maintenance",
  snow_event: "Snow event",
};

function fmt(d: Date | null): string {
  return d ? d.toLocaleString() : "—";
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  const job = await getJobDetail(tenantId, id);
  if (!job) notFound();

  const [contacts, notes, events, assignments, communications, drafts, scopeDrafts, scopeSteps] =
    await Promise.all([
      listJobContacts(tenantId, id),
      listJobNotes(tenantId, id),
      listJobEvents(tenantId, id),
      listAssignmentsForJob(tenantId, id),
      listCommunicationsForJob(tenantId, id),
      listDraftsForJobDetailed(tenantId, id),
      listScopeDraftsForJobDetailed(tenantId, id),
      listScopeStepsForJob(tenantId, id),
    ]);
  // 8c.11a billing reads — all existing verified readers (+ listJobBillingEvents, actorName-enhanced).
  const [proposals, changeOrders, vendorInvoices, clientInvoices, payments, margin, readiness, billingEvents] =
    await Promise.all([
      listProposalsForJob(tenantId, id),
      listChangeOrdersForJob(tenantId, id),
      listVendorInvoicesForJob(tenantId, id),
      listClientInvoicesForJob(tenantId, id),
      listPaymentsForJob(tenantId, id),
      getJobMargin(tenantId, id),
      getBillingCloseReadiness(tenantId, id),
      listJobBillingEvents(tenantId, id),
    ]);
  const notesById = Object.fromEntries(notes.map((n) => [n.id, n.body]));
  const addContact = createJobContactAction.bind(null, id);
  const addNote = createJobNoteAction.bind(null, id);

  // 6c.1 timeline-notes filter (page-side, in-memory — fine at Phase 6 scale; refactor to
  // a data-layer filter only if note counts grow). A note narrates in the timeline iff it
  // is NOT internal_only (internal_only stays workspace-only per the two-view model) AND
  // has not already been shared as a communication (the share IS its representation — a
  // shared note is its comm row, never duplicated as a note). R-6.x.
  const sharedNoteIds = new Set(
    communications
      .filter((c) => c.sourceType === "job_note" && c.sourceId)
      .map((c) => c.sourceId as string),
  );
  const timelineNotes = notes.filter(
    (n) => n.visibility !== "internal_only" && !sharedNoteIds.has(n.id),
  );

  // Scope state is derived from the substrate tables, not jobs.scope_generation_status
  // (KL-7.f / D-7.e): a job has a published scope iff job_scope_steps exist for it.
  const hasPublishedScope = scopeSteps.length > 0;

  const fields: { label: string; value: string | null }[] = [
    { label: "Client", value: job.clientName },
    { label: "Location", value: job.locationName },
    { label: "Trade", value: job.tradeName },
    { label: "Priority", value: job.priorityName },
    { label: "Status", value: job.statusName },
    { label: "Source", value: sourceLabel[job.sourceType] ?? job.sourceType },
    {
      label: "Not-to-exceed",
      value: job.notToExceedAmount ? `$${job.notToExceedAmount}` : null,
    },
  ];

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href="/jobs" className="hover:text-neutral-900">
          Jobs
        </Link>{" "}
        / #{job.jobNumber}
      </div>
      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Job #{job.jobNumber}</h1>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
          {job.statusName}
        </span>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{f.label}</dt>
            <dd className="mt-1 text-sm font-medium">{f.value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
        <dt className="text-xs uppercase tracking-wide text-neutral-500">Problem description</dt>
        <dd className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">
          {job.problemDescription}
        </dd>
      </div>

      {job.scopeOfWork && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Initial scope</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">
            {job.scopeOfWork}
          </dd>
        </div>
      )}

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Scheduled start", value: fmt(job.scheduledStartAt) },
          { label: "Scheduled end", value: fmt(job.scheduledEndAt) },
          { label: "Due", value: fmt(job.dueAt) },
          { label: "Completed", value: fmt(job.completedAt) },
          { label: "Closed", value: fmt(job.closedAt) },
          { label: "Created", value: job.createdAt.toLocaleString() },
        ].map((f) => (
          <div key={f.label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{f.label}</dt>
            <dd className="mt-1 text-sm font-medium">{f.value}</dd>
          </div>
        ))}
      </dl>

      {/* Scope of work */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Scope of work</h2>
          {!hasPublishedScope && <GenerateScopeButton jobId={job.id} />}
        </div>
        {hasPublishedScope && (
          <div className="mt-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-800">
              {scopeSteps.map((s) => (
                <li key={s.id} className="whitespace-pre-wrap">
                  {s.instruction}
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-neutral-500">Scope published. Re-scope is not yet supported.</p>
          </div>
        )}
        {scopeDrafts.length > 0 ? (
          <ScopeDraftsSection jobId={job.id} drafts={scopeDrafts} publishDisabled={hasPublishedScope} />
        ) : !hasPublishedScope ? (
          <p className="mt-3 text-sm text-neutral-600">No scope generated yet.</p>
        ) : null}
      </div>

      {/* Dispatch */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Dispatch</h2>
          {job.primaryTradeId && (
            <Link
              href={`/jobs/${job.id}/dispatch/new`}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Dispatch a vendor
            </Link>
          )}
        </div>
        {!job.primaryTradeId ? (
          <p className="mt-3 text-sm text-neutral-600">
            Assign a trade to this job before dispatching a vendor.
          </p>
        ) : assignments.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">No vendors dispatched yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {assignments.map((a) => (
              <Link
                key={a.id}
                href={`/jobs/${job.id}/dispatch/${a.id}`}
                className="block rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <DispatchStatusBadge
                      category={a.statusCategory}
                      label={a.statusName}
                    />
                    <span className="text-sm font-medium text-neutral-900">
                      {a.vendorName}
                    </span>
                  </div>
                  <span className="text-sm text-neutral-500">View →</span>
                </div>
                <p className="mt-1 text-sm text-neutral-600">
                  {[
                    a.vendorLocationName ?? "Vendor-wide",
                    a.scheduledStartAt
                      ? `Scheduled ${a.scheduledStartAt.toLocaleString()}`
                      : null,
                    a.agreedNteAmount ? `NTE $${a.agreedNteAmount}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {facetLine({
                    tradeName: a.matchedTradeName,
                    primaryTradeMatch: a.matchedTradeWasPrimary,
                    tightestGeo: a.tightestGeoAtDispatch,
                    compliance: a.complianceStatusAtDispatch,
                  })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Contacts */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Contacts</h2>
        <div className="mt-3">
          <ContactList contacts={contacts} />
        </div>
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-medium text-neutral-800">Add a contact</h3>
          <div className="mt-3">
            <ContactForm action={addContact} />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Notes</h2>
        <div className="mt-3 space-y-2">
          {notes.length === 0 ? (
            <p className="text-sm text-neutral-600">No notes yet.</p>
          ) : (
            notes.map((n) => (
              <div
                key={n.id}
                className="rounded-lg border border-neutral-200 bg-white p-3"
              >
                <div className="mb-1">
                  <NoteVisibilityBadge visibility={n.visibility} />
                </div>
                <p className="whitespace-pre-wrap text-sm text-neutral-800">{n.body}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {n.createdAt.toLocaleString()}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <DraftClientUpdateButton jobId={job.id} noteId={n.id} />
                  {(n.visibility === "client_visible" ||
                    n.visibility === "client_and_vendor_visible") && (
                    <ShareNoteButton jobId={job.id} noteId={n.id} audience="client" />
                  )}
                  {(n.visibility === "vendor_visible" ||
                    n.visibility === "client_and_vendor_visible") && (
                    <ShareNoteButton jobId={job.id} noteId={n.id} audience="vendor" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-medium text-neutral-800">Add a note</h3>
          <div className="mt-3">
            <JobNoteForm action={addNote} />
          </div>
        </div>
      </div>

      {/* Update drafts (rewriter) */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Update drafts</h2>
        <UpdateDraftsSection
          jobId={job.id}
          drafts={drafts}
          notesById={notesById}
          clientName={job.clientName}
        />
      </div>

      {/* Communications */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Communications</h2>
        {communications.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            No communications yet. Share a client- or vendor-visible note above to log one.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {communications.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-neutral-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <DeliveryStatusBadge status={c.deliveryStatus} />
                  <NoteVisibilityBadge visibility={c.visibility} />
                  <span className="text-xs uppercase tracking-wide text-neutral-500">
                    {c.channel} · {c.direction}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">
                  {c.summary}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {c.recipientEmail ? `To ${c.recipientEmail} · ` : ""}
                  {c.sentByName ?? "System"} · {c.createdAt.toLocaleString()}
                </p>
                <div className="mt-2">
                  <DeliveryTransitionButtons
                    jobId={job.id}
                    commId={c.id}
                    status={c.deliveryStatus}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Billing (8c.11a — read-only summary; record screens are 8c.11b–e) */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Billing</h2>
        <div className="mt-3">
          <BillingSection
            margin={margin}
            readiness={readiness}
            proposals={proposals}
            changeOrders={changeOrders}
            vendorInvoices={vendorInvoices}
            clientInvoices={clientInvoices}
            payments={payments}
          />
        </div>
      </div>

      {/* Proposals (8c.11b — navigable list + create) */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Proposals</h2>
        <div className="mt-3">
          <ProposalList proposals={proposals} jobId={id} />
        </div>
      </div>

      {/* Change orders (8c.11c — navigable list + create) */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Change orders</h2>
        <div className="mt-3">
          <ChangeOrderList changeOrders={changeOrders} jobId={id} />
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Timeline</h2>
        <div className="mt-3">
          <JobTimeline rows={mergeTimeline(events, communications, timelineNotes, billingEvents)} />
        </div>
      </div>
    </div>
  );
}
