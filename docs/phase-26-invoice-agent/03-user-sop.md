# Phase 26 — User SOP (Operator)

How an operator uses the invoice creator, end to end.

## When to use it

A job is **completed** and the vendor has **submitted their invoice**. Instead of hand-writing the
client invoice, you ask the agent to draft it for you — it produces a marked-up, client-facing draft
you review and correct.

## 1. Generate the draft

From the job (status **Completed**) with a submitted vendor invoice, trigger the invoice creator
(`generateInvoiceAction`, bound to the job + that vendor invoice). The agent:

- reads the vendor invoice and its line items, plus the job context;
- writes a **client-facing description** for each line (it does **not** write any dollar amounts);
- copies the **costs** from the vendor invoice and applies the client's **markup rule** as a preview;
- lands a draft at **pending review**.

If the job is not Completed, or there is no vendor invoice on it, the agent refuses with a clear
message ("The job must be completed before invoicing the client." / "Vendor invoice not found on this
job.").

## 2. Review and correct (the gate)

The draft is yours to change before anything becomes a real invoice:

- **Approve as-is** — the draft ships unchanged.
- **Edit, then approve** — rewrite a description, fix a category, **correct a quantity or unit
  price**, or **break out a lumped line** into proper line items. You *can* edit the numbers here;
  the AI could not produce them, but you have the authority to set them right. Your edited invoice is
  saved as the operator-corrected version (and quietly becomes a training example that sharpens the
  agent over time).
- **Reject** — with a required reason. Nothing is materialized.
- **Discard** — silent dismissal, no reason.

If the vendor sent a **single lumped charge**, the draft will show **one line at the vendor total**
marked as lumped — that is intentional (the agent never invents a split). Break it out yourself here
if you want itemized client billing.

## 3. Publish (materialize to a draft invoice)

Approve, then **Publish**. This **materializes** the approved draft into a real **client invoice at
status Draft** — it copies your approved lines, applies the client's *current* markup rule, and
computes the totals. Publishing does **not** send the invoice to the client. If you try to publish
the same draft twice, it refuses ("already turned into a client invoice").

## 4. Issue (accounting)

Issuing the invoice to the client (Draft → Sent) is an **accounting** action — the existing **Send
(issue)** button on the Client Invoices screen, which only the accounting role (or super-admin) can
use. The materialized draft appears there; accounting reviews and issues it. This step is unchanged
by this phase.

## The one rule to remember

**The AI never sets a dollar figure.** Every amount on the draft comes from the vendor invoice and the
client's billing rules. If a number is wrong, it came from the vendor invoice or the rule — and you
can correct it at the review gate.
