import "server-only";

import type { AgentTool } from "@/server/agents/runner";
import { getJobDetail, type JobDetail } from "@/server/jobs";
import {
  getVendorInvoice,
  listVendorInvoiceLineItems,
  type VendorInvoiceRow,
  type VendorInvoiceLineItemRow,
} from "@/server/billing/vendor-invoices";
import { createInvoiceDraft, type InvoiceDraft } from "./drafts";

// The invoice creator's tools — read-BROAD (job context + the source vendor invoice + its lines),
// write-NARROW (one write: a draft at pending_review, the agent's only operational-adjacent write).
// Registered through the runner (registerTool) so each call auto-logs to agent_tool_calls. NOTE: there
// is NO job-status read here — invoicing is not gated on job lifecycle (the vendor invoice is the only
// precondition; see index.ts).

export const getJobDetailTool: AgentTool<{ tenantId: string; jobId: string }, JobDetail | null> = {
  name: "getJobDetail",
  kind: "read",
  run: ({ tenantId, jobId }) => getJobDetail(tenantId, jobId),
};

export const getVendorInvoiceTool: AgentTool<{ tenantId: string; id: string }, VendorInvoiceRow | null> = {
  name: "getVendorInvoice",
  kind: "read",
  run: ({ tenantId, id }) => getVendorInvoice(tenantId, id),
};

export const listVendorInvoiceLineItemsTool: AgentTool<
  { tenantId: string; vendorInvoiceId: string },
  VendorInvoiceLineItemRow[]
> = {
  name: "listVendorInvoiceLineItems",
  kind: "read",
  run: ({ tenantId, vendorInvoiceId }) => listVendorInvoiceLineItems(tenantId, vendorInvoiceId),
};

export const createInvoiceDraftTool: AgentTool<Parameters<typeof createInvoiceDraft>[0], InvoiceDraft> = {
  name: "createInvoiceDraft",
  kind: "write",
  run: (input) => createInvoiceDraft(input),
};
