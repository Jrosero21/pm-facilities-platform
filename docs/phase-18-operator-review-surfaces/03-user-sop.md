# Phase 18 — User SOP (Operator)

Audience: aggregator operators. Surface: **Review** (top nav → `/review`).

## Triaging AI drafts (Drafts tab)

1. Open **Review** from the top nav. The **Drafts** tab is the default.
2. The queue lists every draft awaiting action across all your jobs, in two lanes:
   - **Pending review** — drafts the assistant produced, awaiting your decision.
   - **Ready to publish** — drafts you already approved, awaiting publish.
3. Each row shows the job it belongs to (**#job-number · client**) — click it to open the job for
   full context.
4. On a **Pending review** row, click **Review** to expand. You'll see (when present) the items the
   assistant stripped, its rephrasings, and its rationale, plus:
   - **Approve** — edit the client-facing text inline if needed, then Approve. The edit is preserved
     as the operator-approved version; the original draft stays immutable for audit.
   - **Reject** — give a reason; the draft is rejected (a formal review row records why).
   - **Discard** — silent dismissal (no reason, no review row).
5. On a **Ready to publish** row, click **Publish to client** — this saves a client-portal draft you
   Send afterward (sending itself is a separate, later step).

> Drafts that are published, rejected, or discarded leave the queue — the queue is the *actionable*
> set. Dismissed items remain visible on the job detail page.

## Reviewing vendor updates & sharing them with clients (Vendor updates tab)

1. In **Review**, click the **Vendor updates** tab.
2. You'll see every vendor-submitted note across your jobs (**#job-number · client**, the note body,
   a "Vendor" origin tag, the current visibility, author, and time). Vendor notes arrive
   **internal-only** — they are never automatically visible to the client.
3. To share a vendor note with the client, use the **Promote to** control on that row:
   - choose **Client-visible** or **Client + vendor**, then click **Promote**.
4. Promotion flips the note's visibility and records the change in the audit trail. **It does not
   send anything** — it changes who is *allowed* to see the note. Outbound delivery is a separate
   capability (a later phase).
5. Notes already client-visible show their badge with no promote control.

## What you cannot do here (by design)

- You cannot promote a note to anything except client-visible or client+vendor (no demotion / arbitrary
  visibility from this surface).
- Promotion does not notify or email the client — it is a visibility change only.
