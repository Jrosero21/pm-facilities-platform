# Phase 6 — User SOP

Procedures for an aggregator user (operator/tenant_admin) working a job's notes, communications, and client updates. All screens live under the protected `(app)` shell and act within your active tenant. Builds on Phase 4 (notes) and Phase 5 (dispatch).

## SOP-6.1 — Add a note and classify its visibility
1. On a job (`/jobs/[id]`), **Notes** → write the note → pick a **visibility**: **Internal only** (operator workspace — default), **Vendor-visible**, **Client-visible**, **Client + vendor**, or **Requires review** (flagged for a second look before sharing).
2. Setting a visibility is **classification only** — it does **not** send the note anywhere. Sharing is a separate, deliberate action (SOP-6.2). The badge on each note shows its current visibility.

## SOP-6.2 — Share a note with the client or vendor
- A note classified client- or vendor-visible shows **Share** buttons. **Share with client** / **Share with vendor** logs a **communication** tied to the job (the note *is* the content — nothing is duplicated). A `client_and_vendor_visible` note shows both buttons; each share creates a communication scoped to that one audience.
- Sharing **does not send** — the communication lands at delivery status **Draft**. You then advance it (SOP-6.4). Re-sharing the same note is allowed.

## SOP-6.3 — Read the Communications section + the Timeline
- **Communications** lists every communication on the job (newest first) — channel, direction, delivery badge, visibility badge, recipient, and who logged it.
- **Timeline** interleaves three categories into one story, oldest-first: **milestones** (slate — created, dispatched), **communications** (indigo), and **notes** (rose). Filter pills: **All / Milestones / Communications / Notes**. A note appears here only if it's shareable *and* not yet shared (a shared note shows as its communication instead); internal-only notes stay in the Notes section.

## SOP-6.4 — Advance a communication's delivery
- On a communication, use the delivery buttons (**Mark sent**, **Mark queued**, then **Mark delivered** / **Mark failed**). The buttons show only the legal next steps from the current state. **Draft → Sent** is the point the message actually leaves; delivered/bounced are terminal.

## SOP-6.5 — Draft a client update with the rewriter (AI)
1. On any note, click **Draft client update**. The rewriter (AI) reads the note + job context and produces a **client-safe draft** — stripping pricing/NTE figures, internal process language, and vendor names where they don't matter to the client; preserving what's happening, timing, and next steps. (~A few seconds; "Generating…" shows.)
2. The draft lands in **Update drafts → Pending review**. It is **never** sent to the client automatically.

## SOP-6.6 — Review, edit, approve (or reject / discard) a draft
- In **Update drafts → Pending review**, click **Review** on a draft. You see the **original note**, what the rewriter **stripped**, any **rephrasings**, its **confidence** and **rationale**, and the **editable client-facing draft**.
- **Approve** (optionally after editing the text) → moves the draft to **Ready to publish**. Your edit is recorded on the review; the rewriter's original output is preserved for the record.
- **Reject** (requires a reason) or **Discard** (silent dismissal) → moves it to **Dismissed**.

## SOP-6.7 — Publish an approved draft to the client
- In **Ready to publish**, click **Publish to client**. This creates a **client-visible communication** (client portal), pre-filled to the client's primary contact, at delivery status **Draft** — i.e. **Publish ≠ Send**; you Send it via the delivery buttons afterward. The published draft leaves the queue (it's now a communication, visible in Communications + the Timeline).

## Worked example (Job #2 — HVAC, New York NY)
On Job #2, the operator wrote a note marked **Requires review** to flag a $750 NTE-overage situation needing client authorization. Rather than hand-composing a client-facing version, they clicked **Draft client update** — the rewriter produced a client-safe version, *"The technician has identified a part replacement needed to restore cooling on the rooftop HVAC unit. We are currently seeking your authorization before proceeding with the repair. Please expect a follow-up from our team shortly to confirm next steps."*, stripping the $750/NTE figures and the vendor name while preserving the part-needed + awaiting-authorization facts. After reading the strip list and rationale, they **approved as-is** (no edits needed) and clicked **Publish to client**. The published update became a `client_portal` communication at delivery status **Draft** — Job #2 now has **2 communications** (the earlier shared note + this published update); the operator's next action when ready is **Mark sent**.

## What users cannot do yet
- **Compose an ad-hoc message** (new email/SMS not from a note) or **log an inbound message** — schema exists, UI is **Phase 6.5**.
- **Manage email templates** — the table exists; no UI / no send pipeline (Phase 13).
- **Configure per-client rewriter policy** (which clients auto-publish) — Phase 6 requires review for every draft; per-client policy is **Phase 7**.
- **Actually transmit** a communication to a real portal/inbox — delivery status is operator-tracked; there is no external send (Phase 13).
