# Phase 25 — User SOP (Operators)

**There is nothing new to click.** This phase has no new screen, button, or setting. It changes how
the work you already do makes the agents better over time.

## Your reviews are now the training signal

Every time the rewriter or scope generator produces a draft, you already do one of three things at
the review step. As of Phase 25, each of those becomes a labeled example the agent learns from:

| What you do at review | What it teaches the agent |
|---|---|
| **Approve as-is** (no edit) | "This draft was good." → a **positive** example (confirmed-good output). |
| **Edit, then approve** | "This is how it should have read." → a **gold** example. The difference between the draft and your edit is the correction — the highest-value signal. |
| **Reject** | Banked as a negative signal (not yet shown to the agent — see limitations). |

The agents are seeded with the best recent examples from **your tenant** (gold first, then positive)
the next time they run. So the more carefully you correct drafts, the sharper the drafts get — a
virtuous loop with no extra effort on your part.

## What to keep doing

- **Edit drafts to the standard you actually want**, then approve. An edit-then-approve is worth more
  than an approve-as-is — it shows the agent the *correction*, not just a thumbs-up.
- **Be consistent.** The agent generalizes from your edits; consistent corrections sharpen faster.

## What has NOT changed (important)

- **AI output is still a draft, pending your review.** Few-shot makes the *first draft* better; it
  does **not** auto-publish anything. The review gate is exactly as before — nothing the agent
  produces reaches a client or a job until you approve it.
- **No behavior change on day one.** Because corrections are still few, the drafts today look about
  the same as before. The improvement accrues quietly as your review history grows. That is expected
  and by design.
