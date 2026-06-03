import "server-only";

import type { JobDetail } from "@/server/jobs";
import type { VendorInvoiceRow, VendorInvoiceLineItemRow } from "@/server/billing/vendor-invoices";

// The invoice creator's per-run user prompt assembly. The system prompt (the §2.9 behavior
// contract) is DB-stored in ai_prompt_templates — seed source-of-record db/seeds/agent-config.ts,
// resolved at runtime by runInvoiceCreator. This builder is a pure string assembler.
//
// MONEY-SAFETY (D1): the vendor line numbers ARE shown to the model — but ONLY as read-only
// context so it understands what it is describing. The model returns category + description +
// reconcilesToVendorLineId per line (and a lumpFlag judgment); it is instructed to output NO
// amounts. The dollar figures are joined back in by runInvoiceCreator from the vendor lines.

/** Assemble the per-run user prompt: the vendor invoice (header + line items as read-only
 *  context) + the job context, with explicit money-safety + lumpFlag instructions. */
export function buildInvoiceUserPrompt(input: {
  vendorInvoice: VendorInvoiceRow;
  vendorLines: VendorInvoiceLineItemRow[];
  job: JobDetail;
}): string {
  const { vendorInvoice, vendorLines, job } = input;

  const lineRows =
    vendorLines.length > 0
      ? vendorLines
          .map(
            (l) =>
              `  - vendorLineId=${l.id} | category=${l.category} | qty=${l.quantity}${
                l.unit ? ` ${l.unit}` : ""
              } | unitPrice=${l.unitPrice} | extended=${l.extendedAmount} | "${l.description}"`,
          )
          .join("\n")
      : "  (no itemized lines — this vendor invoice is a single lumped charge)";

  return [
    `You are drafting the CLIENT-FACING invoice for a completed facilities maintenance work order.`,
    `The numbers below are the VENDOR's submitted costs — shown only as context so you understand`,
    `what you are describing. You must NOT output any amounts; the platform applies the cost and`,
    `markup from billing rules. Write client-facing line DESCRIPTIONS only.`,
    ``,
    `Job context:`,
    `  Client: ${job.clientName ?? "—"}`,
    `  Trade: ${job.tradeName ?? "—"}`,
    `  Location: ${job.locationName ?? "—"}`,
    `  Problem: ${job.problemDescription}`,
    job.approvedScopeOfWork ? `  Approved scope:\n${job.approvedScopeOfWork}` : null,
    ``,
    `Vendor invoice ${vendorInvoice.invoiceNumber ? `#${vendorInvoice.invoiceNumber}` : "(no number)"}`,
    `  status=${vendorInvoice.status} | source=${vendorInvoice.sourceType} | total=${vendorInvoice.total} ${vendorInvoice.currency}`,
    `  Line items:`,
    lineRows,
    ``,
    `Instructions:`,
    `- For EACH vendor line, write one client-facing line: a clear, professional description of the`,
    `  work done, and set reconcilesToVendorLineId to that line's vendorLineId. Choose a category`,
    `  from: labor, materials, equipment, trip, permit, fee, tax, other.`,
    `- Do NOT output quantity, unit price, markup, or any dollar figure — descriptions only.`,
    `- Set lumpFlag=true ONLY if the vendor invoice is a single lumped / non-itemized charge (you`,
    `  cannot break it into real line items). When lumpFlag=true, produce ONE line describing the`,
    `  overall work — never invent a split into separate labor/materials amounts.`,
    `- Return your confidence and a one-line rationale.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
