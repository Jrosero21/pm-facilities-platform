// PURE content module — NO "server-only", NO DB/env/IO. The invoice notification's subject and
// body, split out from invoice-notify.ts so it is unit-testable: vitest covers the pure modules
// only, and anything in a server-only chain can never reach it (vitest.config.ts).
//
// The split follows the precedent set by billing/line-item-types.ts. It also fixes, for this path,
// the gap dispatch-notify still has: buildDispatchNotification is pure in every respect EXCEPT that
// it lives inside a "server-only" module, so it has no unit tests at all.

import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format-date";

export type InvoiceNotificationInput = {
  invoiceLabel: string;
  jobNumber: number | null;
  clientName: string | null;
  locationName: string | null;
  total: string;
  currency: string;
  dueAt: Date | null;
  paymentTermsDays: number | null;
  /** The tenant's own name — who the invoice is FROM, as the client will read it. */
  fromName: string;
};

export type InvoiceNotificationContent = { subject: string; body: string };

/**
 * Pure content builder — no DB, no I/O, deterministic.
 *
 * The only money it states is the invoice TOTAL — the figure the client is being asked to pay, and
 * which is on the attached PDF anyway. No subtotal, no markup, no vendor cost: consistent with
 * OQ-6, and impossible to leak here because none of those are inputs.
 */
export function buildInvoiceNotification(
  input: InvoiceNotificationInput,
): InvoiceNotificationContent {
  const forWhat = input.jobNumber !== null ? ` for work order #${input.jobNumber}` : "";
  const subject = `Invoice ${input.invoiceLabel}${forWhat} from ${input.fromName}`;

  const lines: string[] = [
    `Please find invoice ${input.invoiceLabel} attached.`,
    "",
    `Invoice: ${input.invoiceLabel}`,
  ];
  if (input.jobNumber !== null) lines.push(`Work order: #${input.jobNumber}`);
  if (input.clientName) lines.push(`Client: ${input.clientName}`);
  if (input.locationName) lines.push(`Location: ${input.locationName}`);
  lines.push(`Amount due: ${formatMoney(input.total)} ${input.currency}`);
  if (input.dueAt) {
    lines.push(`Due: ${formatDate(input.dueAt)}`);
  } else if (input.paymentTermsDays !== null) {
    lines.push(`Payment terms: net ${input.paymentTermsDays} days`);
  }
  lines.push("");
  lines.push("The full invoice is attached as a PDF.");
  lines.push("");
  lines.push("Thank you,");
  lines.push(input.fromName);

  return { subject, body: lines.join("\n") };
}
