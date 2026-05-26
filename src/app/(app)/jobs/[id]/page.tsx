import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getJobDetail } from "@/server/jobs";
import { listJobContacts } from "@/server/job-contacts";
import { listJobNotes } from "@/server/job-notes";
import { listJobEvents } from "@/server/job-events";
import { listAssignmentsForJob } from "@/server/dispatch";
import { createJobContactAction } from "@/app/(app)/jobs/contact-actions";
import { createJobNoteAction } from "@/app/(app)/jobs/note-actions";
import { ContactForm } from "@/components/contact-form";
import { ContactList } from "@/components/contact-list";
import { JobNoteForm } from "@/components/job-note-form";
import { DispatchStatusBadge } from "@/components/dispatch-status-badge";
import { facetLine } from "@/components/dispatch-facets";

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

  const [contacts, notes, events, assignments] = await Promise.all([
    listJobContacts(tenantId, id),
    listJobNotes(tenantId, id),
    listJobEvents(tenantId, id),
    listAssignmentsForJob(tenantId, id),
  ]);
  const addContact = createJobContactAction.bind(null, id);
  const addNote = createJobNoteAction.bind(null, id);

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
                <p className="whitespace-pre-wrap text-sm text-neutral-800">{n.body}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {n.createdAt.toLocaleString()}
                </p>
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

      {/* Timeline */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Timeline</h2>
        <ul className="mt-3 space-y-2">
          {events.map((e) => (
            <li key={e.id} className="text-sm text-neutral-700">
              {e.summary}{" "}
              <span className="text-neutral-500">
                — {e.actorName ?? "System"} — {e.createdAt.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
