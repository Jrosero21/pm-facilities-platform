# AI-Assisted Dispatch — User SOP (Operator)

## What changes for you
When auto-dispatch runs for a job, the system now picks the BEST eligible vendor
by your configured priority instead of the first one found — and on a genuine
toss-up between two near-equal vendors, an AI may break the tie. You still review
drafts exactly as before; nothing auto-sends unless your tenant has autonomy on.

## How a vendor gets picked (what you'll see)
1. Your go-to vendor for that location wins whenever they're eligible.
2. Otherwise, the vendor with the best track record (reliably finishes the work).
3. Ties beyond that go to the vendor whose main line is that exact trade.
The full ranking — not just the winner — is recorded on the draft for review.

## When the AI steps in
Only when the top two are too close to separate on track record AND your tenant's
firing mode allows it AND you're within the AI budget. The AI reads the job's
problem and each vendor's specialization, picks one of the two, and writes a
one-line reason. If the AI is unavailable, over budget, off, or unsure, the
deterministic ranking stands — no gap, no stall.

## What you still do
- Review drafted dispatches as usual (visibility/approval unchanged).
- If your tenant runs with autonomy off, every dispatch is drafted and held for
  you regardless of the re-rank or tiebreak.
- To see why a vendor was chosen, read the ranking + tiebreak rationale recorded
  on the draft.

## Setting the AI tiebreaker mode (per tenant)
- `autonomy_only` (default): AI breaks ties only when autonomy is on.
- `always_on_close_call`: AI also explains close calls on held drafts.
- `off`: AI never breaks ties; deterministic ranking only.
