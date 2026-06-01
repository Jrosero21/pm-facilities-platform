# Phase 16 — User SOP (Operator)

How an operator uses the assistant. **Note:** Phase 16 ships the service layer only; a chat UI
is deferred (B-16.3). This SOP describes the intended operator flow once that surface exists —
the underlying tools and the human gate it documents are live today.

## What the assistant does for you

The assistant is a **read/draft helper**, not an autopilot. It can:

1. **Answer "how does the app work" questions** — it searches the platform's authored knowledge
   (the per-phase `07-chatbot-knowledge.md` docs) and cites the source doc. Ask things like
   "how does dispatch work?" or "what is the snow event flow?".
2. **Summarize a job** — `summarizeJob` returns status, client/location, problem, stall state,
   margin, and invoice counts for one job.
3. **Triage your queue** — `identifyStalledJobs` and `identifySlaRisks` surface what needs
   attention now (stalled, overdue, unassigned-high-priority), reusing the dashboard's logic.
4. **Flag billing anomalies** — `flagInvoiceAnomalies` lists jobs with negative margin or an
   NTE breach (approved vendor cost over the not-to-exceed cap).
5. **Look up a vendor** — `summarizeVendorPerformance` returns the vendor profile (scoring is
   not available yet — B-16.4).
6. **Recommend a next action** — `recommendNextAction` gives read-only advice for one job.

## Drafting an outbound update — and the human gate

The assistant can **draft** a client update or a vendor follow-up:

- `draftClientUpdate(jobId)` → a client-facing update draft.
- `draftVendorFollowUp(jobId)` → a vendor-facing follow-up draft.

**The assistant only DRAFTS.** Each draft lands at **`pending_review`** in the existing rewrite-
draft queue, attributed to the assistant. It is **never** published or sent automatically. To
make a draft go out, a **human**:

1. Reviews the draft (edit if needed — your edits are preserved separately from the AI's text).
2. **Approves** it (the review step — `pending_review → approved`).
3. **Publishes** it (the human-gated `publishRewriteDraft` → writes the client update + a
   communication row at `delivery_status='draft'`).
4. **Sends** it via the existing delivery flow (Publish ≠ Send).

This is the §2.5 draft-vs-act gate: AI proposes, a human disposes. The assistant has no path to
steps 2–4.

## What the assistant will NOT do

It will not publish, send, change job status, act autonomously, or read another tenant's data.
Every tool call is scoped to your active tenant and logged.
