import { resolveMagicLinkToken } from "@/server/magic-links/token-core";
import { getAssignmentDetail } from "@/server/dispatch";
import {
  listLinkNotes,
  listLinkAttachments,
  getLinklessAttachmentUrl,
} from "@/server/magic-links/link-surface";
import { LinkSurface } from "@/components/magic-link/link-surface";

// Phase 21 — the linkless magic-link surface. SESSION-PUBLIC: a top-level segment outside the
// (vendor)/(app)/(client) auth groups, inheriting only the root layout (no auth shell). The raw
// token in the path is the only credential — resolved server-side here. A bad/expired/revoked/
// forged token renders one generic "invalid link" view (no reason leak), mirroring resolve's
// {ok:false}. Reads are gated by source_token_id = the resolved token (not author-scope).
export default async function MagicLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const res = await resolveMagicLinkToken(token);
  if (!res.ok) return <InvalidLink />;

  const detail = await getAssignmentDetail(res.tenantId, res.assignmentId);
  if (!detail) return <InvalidLink />; // uniform — never disclose why

  const [notes, attachments] = await Promise.all([
    listLinkNotes(res.tenantId, res.tokenId),
    listLinkAttachments(res.tenantId, res.tokenId),
  ]);
  const photos = await Promise.all(
    attachments.map(async (a) => ({
      row: a,
      served: await getLinklessAttachmentUrl(res.tenantId, a.id, res.tokenId),
    })),
  );

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Work order #{detail.jobNumber}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {detail.vendorName} · status:{" "}
          <span className="font-medium text-neutral-900">{detail.statusName}</span>
        </p>
      </header>

      {/* The interactive actions (token-bound; per-action re-resolution server-side). */}
      <LinkSurface token={token} statusCode={detail.statusCode} />

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Your notes</h2>
        {notes.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No notes yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                <p className="whitespace-pre-wrap text-sm text-neutral-800">{n.body}</p>
                <p className="mt-1 text-xs text-neutral-500">{new Date(n.createdAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Your photos</h2>
        {photos.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No photos yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {photos.map(({ row, served }) => (
              <div key={row.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                <p className="text-sm text-neutral-800">{row.title}</p>
                {served.kind === "url" && (
                  <a href={served.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={served.url} alt={row.title} className="max-h-48 rounded-md border border-neutral-200 object-cover" />
                  </a>
                )}
                {served.kind === "unavailable" && (
                  <p className="mt-1 text-xs text-neutral-500">Image unavailable.</p>
                )}
                <p className="mt-1 text-xs text-neutral-500">{new Date(row.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function InvalidLink() {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">This link is no longer valid</h1>
      <p className="mt-2 text-sm text-neutral-600">
        The link may have expired or been revoked. Please request a new link.
      </p>
    </main>
  );
}
