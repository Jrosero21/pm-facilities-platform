# Phase 27 — Chatbot Knowledge

Plain-language facts about the proposal generator, for the operations assistant.

## What the proposal generator is

- It is the platform's AI that **drafts a proposal** — the priced document an operator would otherwise
  write by hand — from a job's context. It is the 2nd of the "new agents" (after the invoice creator).
- A proposal comes in **two flavors**:
  - **Client** — the priced document the **client approves** (the normal proposal you send).
  - **Internal** — an **operator-only billing record** the system creates when the work is within the
    agreed price ceiling. The client never sees an internal proposal.
- Which flavor a proposal becomes is decided automatically at publish by comparing the proposal total
  to the **job's NTE** (not-to-exceed amount).

## What it does — and what's safe about it

- **The AI never sets a price.** It writes only the category, a description, and the scope wording.
  **You** enter the quantities and unit prices when you review it. Every dollar on a published proposal
  is yours or the markup rule's.
- **It can't accidentally bill $0.** If a draft has no pricing, publishing it is **refused** — you must
  price it first.
- **Internal proposals can't leak to a client.** A proposal only appears to a client when it is both
  *sent* and *client*-flavored — an internal one is sealed out.
- **NTE check is per proposal (today).** Each proposal is compared to the job NTE on its own; the
  system does **not** yet add up multiple proposals on the same job. If you're issuing several draws,
  use the "Send to client" option to route one to client review.
- **It always queues for review.** The agent never sends or bills on its own.

## What it does NOT do (yet)

- It does **not** handle a vendor asking to **raise the NTE** (use a change order today).
- It does **not** link a published proposal to a later **client invoice** (no direct link; only a
  shared timeline).
- It does **not** track **cumulative** spend across a job's proposals against the NTE.
- There is **no rendered review screen** yet — the actions exist, but the review/pricing UI is a later
  cross-agent surface.
- It cannot turn an already-billed **internal** proposal back into a **client** one (that flavor is
  final).

## Where the data lives

- Proposals: `proposals` (with the new `kind` = client/internal and the `internal_billed` status).
- The AI's drafts and the operator's review/pricing: `proposal_drafts` and `proposal_reviews`.
- The auto-billing moment: a `proposal.internal_billed` row in the job's billing-events timeline.
