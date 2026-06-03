# Phase 26 — Chatbot Knowledge

What the operations assistant should know about the invoice creator.

## What it is

`invoice_creator_v1` is an AI agent that drafts a **client invoice** from a **vendor's submitted
invoice** on a **completed job**. It writes the client-facing line descriptions and a marked-up
invoice for an operator to review — it is the first of the v2.9.0 "new agents."

## The one rule (money-safety)

**The AI never sets a dollar amount.** Its output schema has no number fields at all — it writes only
descriptions, categories, and which vendor line each client line corresponds to. Every dollar on the
draft comes from the **vendor invoice** (the costs) and the **client's billing rules** (the markup).
If a number looks wrong, it came from the vendor invoice or the markup rule — and an operator can fix
it during review.

## The review gate

Every draft is a **pending-review draft** — nothing is final and nothing is sent automatically. The
operator can:
- approve it as-is,
- edit it (including **correcting the numbers** or breaking out a lumped charge) and approve,
- reject it (with a reason), or
- discard it.

The AI cannot generate numbers, but a human reviewer is allowed to correct them. Those corrections
quietly become training examples that sharpen the agent over time (the Phase-25 feedback loop).

## Lumped vendor invoices

If a vendor sends a single non-itemized charge, the draft keeps it as **one line at the vendor's
total**, marked as "lumped." The agent will **not** invent a split into labor/materials — that would
be making up numbers. An operator can break it out by hand at the review gate.

## Publish vs. issue

- **Publish** turns an approved draft into a real client invoice **at Draft status** — it copies the
  approved lines and applies the client's current markup rule. Publishing does **not** send it to the
  client.
- **Issuing** (sending) the invoice to the client is a separate **accounting** action (the existing
  "Send (issue)" button), restricted to the accounting role. That step is unchanged.

## What it does NOT do

- It does not issue or send invoices (accounting does).
- It does not run automatically — an operator triggers it; there is no auto-create.
- It does not work on jobs that aren't completed, or without a vendor invoice on the job.
- It does not break down lumped vendor charges (that would need vendor rate data the platform does not
  have yet).
