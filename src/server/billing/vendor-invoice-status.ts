// ── Vendor-invoice status predicate (pure util) ───────────────────────────────────────
// PURE util — no "use client", no "server-only", no DB/IO — so BOTH the server vendor-invoice
// list and any client caller can use it (mirrors money.ts / role-gates.ts). A vendor invoice can
// be drafted into a client invoice only while the vendor has it open (received / under_review /
// approved) — NOT a disputed/paid one. The server action remains the authoritative gate (it
// surfaces JOB_NOT_COMPLETED / VENDOR_INVOICE_NOT_FOUND); this is a courteous UI pre-filter.
const DRAFTABLE_VENDOR_INVOICE_STATUSES = new Set(["received", "under_review", "approved"]);

export function canDraftClientInvoice(vendorInvoiceStatus: string): boolean {
  return DRAFTABLE_VENDOR_INVOICE_STATUSES.has(vendorInvoiceStatus);
}
