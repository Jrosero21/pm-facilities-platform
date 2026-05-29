# Phase 8 — Operator SOP (Billing)

Day-to-day billing on a job, operator-facing. Everything here lives on the **job detail page** (`/jobs/[id]`) unless noted. The rules behind these flows are in `06-business-rules.md`; deferred edges point to `10-known-limitations.md`.

## The billing section (your dashboard for a job)

Three read-only cards at the top of the billing area:
- **Margin** — Revenue (what you've billed the client, AR) minus Cost (what you've approved to pay vendors, AP), and the difference. Negative margin shows red. This is a live read; it becomes a permanent snapshot when you close billing.
- **Close readiness** — either "Ready to close" or an advisory list of concerns (unpaid invoices, undecided vendor invoices, draft client invoices, open proposals/change orders). **It never blocks you** — it's a checklist, not a gate. You can close billing with concerns outstanding (write-offs, offline resolutions).
- **Records** — counts per type (proposals, change orders, vendor/client invoices, payments). Each type has its own navigable section below.

Below the cards: a section per record type (each with a "New …" button + a list), then **Payments**, then **Close billing**, then the **Timeline** (which has a "Billing" filter — see the timeline note at the end).

## Proposals (what you quote the client)

Lifecycle: **draft → sent → (accepted | declined) | withdrawn**, plus **revisions**.
1. **New proposal** → fill the header (title, scope text, currency, valid-until). It's created as a **draft**.
2. On the proposal's detail page, **add line items** while it's a draft (category, description, qty, unit price, optional markup %, tax). Totals recompute automatically.
3. **Send** it. Sent proposals can't be edited.
4. When the client responds: **Accept**, **Decline**, or **Withdraw** (withdraw is available while draft/sent/viewed).
5. **Accepted proposals are a commitment** — you can't withdraw them. To change an accepted (or declined/withdrawn) proposal, use **Revise**: that creates a new draft revision in the same chain, copying the header + lines. You then edit and re-send the revision.
   - You can revise from a terminal state too (re-open a declined/withdrawn proposal as a fresh revision).
   - If the chain already has a live revision, you'll see *"There's already a live revision of this proposal"* — finish or terminal-state that one first.

**Proposal vs. change order:** revise a **proposal** *before* acceptance / before work starts. Once work is underway and scope changes, create a **change order** instead (next section).

## Change orders (scope changes after the fact)

Lifecycle: **draft → submitted → (approved | declined) | withdrawn**. Forward deltas — **there is no "revise a change order."** A change order that's declined or needs redoing is left as-is; you create a **new** change order.
1. **New change order** → reason + scope-delta text. Created as a **draft**.
2. Add line items (draft only), then **Submit**.
3. **Approve** / **Decline** / **Withdraw** (withdraw from draft or submitted).
4. The detail page shows the **effective NTE** context: for a draft/submitted CO, "approving this adds $X to the job's effective NTE"; for an approved CO, "included in the effective NTE of $Y." Approved change-order totals raise the job's effective ceiling that vendor invoices are checked against.

## Vendor invoices (AP — what vendors bill you)

Lifecycle: **received → approved | disputed** (payment handled separately).
1. **Record invoice** — you must pick an existing **dispatch** for the job (the vendor + assignment come from that). If the job has no dispatches yet, dispatch a vendor first (see `10-known-limitations.md`, CF-8c.11d.1).
2. Add line items (no markup on AP lines), then **Approve** (you, the operator, validate the invoice) or **Dispute**.
3. **Over-NTE flags:** an invoice is marked "over NTE" when its total exceeds its governing ceiling (its dispatch's agreed amount, or the job's effective NTE). The breach is *recorded on the row immediately* but the **alert event fires when you approve** (the commit-to-pay) — two kinds: this invoice exceeds its own ceiling, and/or the job's total approved AP crosses the job's effective NTE for the first time.

**Note the control split:** *you* approve the vendor invoice (it's valid, the work was done). **Accounting** approves the *payment* (next sections) — see `06-business-rules.md`.

## Client invoices (AR — what you bill the client)

Lifecycle: **draft → sent | void**.
1. **New invoice** → draft (the client is the job's client).
2. Add line items. **Markup pre-fills** from the client's default billing rule: leave the markup field **blank** to use that default; type **0** for explicitly no markup; type a value to override. The placeholder shows the resolved default.
3. **Send (issue)** — this is **accounting-gated**: only accounting (or super-admin) sees the Send button. Issuing captures the revenue.
4. **Void** (accounting-gated) retracts a sent invoice. Drafts can't be voided (and have no discard yet — CF-8c.8.2); only sent invoices.

## Payments

**Record payment** (accounting-gated) opens a form with a **direction** toggle:
- **Incoming (from client)** → pick a **sent** client invoice (AR).
- **Outgoing (to vendor)** → pick an **approved** vendor invoice (AP).

The picker switches with the direction (this mirrors the system's rule that a payment references exactly one invoice — see `06-business-rules.md`). Enter the amount; **partial** payments are fine (the invoice shows *partially paid*); when the running total reaches the invoice total it flips to **paid** and a "paid in full" event fires once. Overpayment is allowed (it stays *paid*; there's no separate overpaid tracking — CF-8c.9.1).

If you see *"This invoice isn't ready to pay yet"*: a vendor invoice must be **approved** first; a client invoice must be **sent** first.

## Close billing

The **Close billing** section (accounting-gated) shows a confirm checkbox + optional note. Closing moves the job to **Closed (Billed)** and snapshots the final margin into the record. It's **explicit and final** — review the readiness card above first (advisory). Billing close is independent of operational close: you don't have to operationally close the job first.

## Reading the timeline

The job timeline merges operational milestones, communications, notes, **and billing events** into one chronological feed. Use the **Billing** filter to see only the financial events (proposal sent/accepted, change order approved, invoice paid, NTE exceeded, billing closed, etc.), each with who did it and when. Billing rows use a distinct (emerald) accent and money chips.
