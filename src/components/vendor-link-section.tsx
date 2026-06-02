"use client";

import { useActionState } from "react";
import {
  sendLinkAction,
  revokeLinkAction,
  type LinkControlState,
} from "@/app/(app)/jobs/[id]/dispatch/[assignmentId]/actions";
import type { AssignmentTokenListItem } from "@/server/magic-links/list-assignment-tokens";

// Phase 21 — operator vendor-link controls. "Send link" mints + emails a fresh magic link to
// the vendor contact (disabled with a note when no contact email is on file). Each active token
// gets a Revoke button. Token state is derived server-side; this view never sees the raw token.
const STATE_BADGE: Record<AssignmentTokenListItem["state"], string> = {
  active: "bg-green-100 text-green-800",
  unsent: "bg-neutral-100 text-neutral-700",
  expired: "bg-amber-100 text-amber-800",
  revoked: "bg-red-100 text-red-700",
};

export function VendorLinkSection({
  jobId,
  assignmentId,
  tokens,
  hasRecipientEmail,
}: {
  jobId: string;
  assignmentId: string;
  tokens: AssignmentTokenListItem[];
  hasRecipientEmail: boolean;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Vendor link</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Send a no-account link so the vendor can update this assignment directly.
      </p>

      <div className="mt-3">
        {hasRecipientEmail ? (
          <SendLinkButton jobId={jobId} assignmentId={assignmentId} />
        ) : (
          <p className="text-sm text-neutral-500">
            No contact email on file for this vendor — add one to send a link.
          </p>
        )}
      </div>

      {tokens.length > 0 && (
        <ul className="mt-4 space-y-2">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white p-3">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATE_BADGE[t.state]}`}>{t.state}</span>
              <span className="text-xs text-neutral-500">
                created {new Date(t.createdAt).toLocaleString()} · expires {new Date(t.expiresAt).toLocaleString()}
              </span>
              {t.state === "active" || t.state === "unsent" ? (
                <RevokeButton jobId={jobId} assignmentId={assignmentId} tokenId={t.id} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SendLinkButton({ jobId, assignmentId }: { jobId: string; assignmentId: string }) {
  const [state, formAction, pending] = useActionState<LinkControlState, FormData>(
    sendLinkAction.bind(null, jobId, assignmentId),
    null,
  );
  return (
    <form action={formAction} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send link"}
      </button>
      <FeedbackText state={state} />
    </form>
  );
}

function RevokeButton({ jobId, assignmentId, tokenId }: { jobId: string; assignmentId: string; tokenId: string }) {
  const [state, formAction, pending] = useActionState<LinkControlState, FormData>(
    revokeLinkAction.bind(null, jobId, assignmentId, tokenId),
    null,
  );
  return (
    <form action={formAction} className="ml-auto inline">
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-60"
      >
        {pending ? "…" : "Revoke"}
      </button>
      <FeedbackText state={state} />
    </form>
  );
}

function FeedbackText({ state }: { state: LinkControlState }) {
  if (state?.error) {
    return <span role="alert" className="ml-2 text-xs text-red-600">{state.error}</span>;
  }
  if (state?.info) {
    return <span className="ml-2 text-xs text-green-700">{state.info}</span>;
  }
  return null;
}
