# Phase 27 — User SOP (Operator)

How an operator uses the proposal generator. **Note:** the server actions exist and are
harness-proven, but a **rendered review screen is deferred** to a cross-agent draft-review surface
(**CF-27.6**) — this SOP describes the intended operator flow the actions implement.

## 1. Generate a proposal draft

- Trigger the proposal generator on a **billable** job. Eligible job states:
  `DISPATCHED, SCHEDULED, IN_PROGRESS, ON_HOLD, COMPLETED`. The agent **refuses** `NEW` (nothing
  scoped yet), `CANCELLED`, `CLOSED`, and `CLOSED_BILLED` ("This job can't be proposed").
- You do **not** wait for the job to be complete — **progress billing** (deposits/draws) is drafted
  while work is underway.
- The agent produces a **number-free** draft: each line has a category, a short description, and the
  work-scope phrasing. **It never writes a price** — that is your job at review.
- The draft always **queues for review**. There is no auto-send.

## 2. Review and PRICE the draft (you author the money)

- Open the pending draft. The AI's phrasing is the starting point; **you author the pricing** —
  quantity and unit price per line. The markup is filled from the client's billing rule.
- This is the §2.5-v1 gate. Your edits are the **gold correction signal** that improves future drafts
  (the system learns from how you *re-phrase*, not from the numbers).
- A proposal with no pricing **cannot be published** (see step 4) — pricing is mandatory.

## 3. (Optional) Preview the routing before publishing

- The read-only routing preview tells you, for the current priced lines: **this proposal totals $X,
  the job's NTE is $Y, so it will route INTERNAL / CLIENT.** No write happens.
- The preview uses the exact same decision the publish uses, so what you see is what you get.

## 4. Approve / reject / discard, then publish

- **Approve** records your review (and your pricing). **Reject** needs a reason. **Discard** silently
  dismisses a draft.
- **Publish** an approved, **priced** draft → it becomes a canonical proposal. The **NTE send-gate**
  decides the flavor:
  - **Total ≤ the job NTE → INTERNAL.** An operator-only billing-intent record (`internal_billed`).
    The client never sees it. A timeline event records the auto-billing.
  - **Total > the job NTE → CLIENT.** A client-facing proposal `draft` you then send for the client to
    approve (the existing proposal lifecycle).
  - **No NTE on the job → CLIENT** (fail-safe — we never auto-bill without a ceiling).
- **"Send to client" override (`forceClientReview`).** When you *want* the client to approve an
  under-NTE proposal (a deposit/draw you want acknowledged), set the override — it forces **CLIENT**.
  It only ever pushes toward client review; it can never force auto-billing.
- **Fails closed without pricing.** If you publish a draft you never priced, it is refused
  ("Add a valid quantity and unit price to every line before publishing") — never a `$0` proposal.

## 5. Progress billing across a job

- A job can have **multiple** proposals (deposit, draw 1, draw 2, final). Generate/price/publish each
  as the work progresses.
- **MVP limit:** the NTE gate today compares **each proposal on its own** against the job NTE — it does
  **not** track cumulative spend across already-published proposals (**CF-27.4**). If you are issuing
  multiple draws, use the **"Send to client" override** to route a draw to client review when its
  *cumulative* effect should be acknowledged, rather than relying on the per-proposal gate.

## What you can rely on

- The AI never prices anything — every dollar on a published proposal is **yours** (or the markup
  rule's).
- An **internal** proposal can never leak to a client surface (it is sealed out of the client portal).
- You can always choose the more-reviewed path (the override), but never less.
