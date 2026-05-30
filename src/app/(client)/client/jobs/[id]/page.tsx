import { notFound } from "next/navigation";
import { requireClient } from "@/server/auth-context";
import { getClientJobDetail } from "@/server/client/get-client-job-detail";
import { listClientJobNotes } from "@/server/client/list-client-job-notes";
import { ClientNoteForm } from "@/components/client/client-note-form";

/**
 * Client work-order detail — Phase 11 batch 11e (read-only).
 *
 * requireClient() → getClientJobDetail (scope-guarded; notFound on out-of-scope,
 * the direct-URL isolation crux SI-11d.1) → listClientJobNotes (client-visible
 * notes only). Renders CLIENT-SAFE fields only — excludes NTE, scope text,
 * source_type, trade, priority, and all vendor/assignment/financial data.
 *
 * Notes render per Option (b): plain "team update" (author or "Team" + timestamp
 * + body), no visibility/origin badges (operator classifications don't surface to
 * the client). No action buttons — note-add is 11g, proposal/invoice are 11i.
 */
export default async function ClientJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireClient();
  const detail = await getClientJobDetail(
    ctx.activeTenant.tenantId,
    id,
    ctx.clientScope,
  );
  if (!detail) notFound();

  const notes = await listClientJobNotes(
    ctx.activeTenant.tenantId,
    id,
    ctx.clientScope,
  );

  return (
    <section className="space-y-8">
      <header>
        <p className="font-mono text-sm text-neutral-500">#{detail.jobNumber}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {detail.statusName}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">{detail.locationName}</p>
      </header>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Description
        </h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">
          {detail.problemDescription}
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {detail.scheduledStartAt && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">
                Scheduled
              </dt>
              <dd className="text-neutral-700">
                {new Date(detail.scheduledStartAt).toLocaleString()}
                {detail.scheduledEndAt
                  ? ` – ${new Date(detail.scheduledEndAt).toLocaleString()}`
                  : ""}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              Submitted
            </dt>
            <dd className="text-neutral-700">
              {detail.createdAt.toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Updates
        </h2>
        <div className="mt-4 space-y-3">
          {notes.length === 0 ? (
            <p className="text-sm text-neutral-500">No updates yet.</p>
          ) : (
            notes.map((n) => (
              <div
                key={n.id}
                className="rounded-lg border border-neutral-200 bg-white p-3"
              >
                <p className="text-xs text-neutral-500">
                  {n.authorName ?? "Team"} ·{" "}
                  {new Date(n.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">
                  {n.body}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="mt-6">
          <ClientNoteForm jobId={id} />
        </div>
      </section>
    </section>
  );
}
