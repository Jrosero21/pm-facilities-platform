import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { jobStatuses, jobs } from "@/server/schema";
import type { AgentTool } from "@/server/agents/runner";
import { getJobDetail, type JobDetail } from "@/server/jobs";
import {
  getVendorInvoice,
  listVendorInvoiceLineItems,
  type VendorInvoiceRow,
  type VendorInvoiceLineItemRow,
} from "@/server/billing/vendor-invoices";
import { createInvoiceDraft, type InvoiceDraft } from "./drafts";

// The invoice creator's tools — read-BROAD (job context + the source vendor invoice + its
// lines + the job's status code for the eligibility gate), write-NARROW (one write: a draft
// at pending_review, the agent's only operational-adjacent write). Registered through the
// runner (registerTool) so each call auto-logs to agent_tool_calls.

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

/**
 * Resolve a job's current status CODE (stable join key, e.g. "COMPLETED" — distinct from the
 * tenant-editable status NAME). JobDetail exposes only statusName, so this focused read backs
 * the eligibility gate ("submitted vendor invoice on a COMPLETED job"). Tenant-scoped.
 */
async function getJobStatusCode(tenantId: string, jobId: string): Promise<string | null> {
  const rows = await db
    .select({ code: jobStatuses.code })
    .from(jobs)
    .innerJoin(jobStatuses, eq(jobs.currentStatusId, jobStatuses.id))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)))
    .limit(1);
  return rows[0]?.code ?? null;
}

export const getJobStatusCodeTool: AgentTool<{ tenantId: string; jobId: string }, string | null> = {
  name: "getJobStatusCode",
  kind: "read",
  run: ({ tenantId, jobId }) => getJobStatusCode(tenantId, jobId),
};

export const createInvoiceDraftTool: AgentTool<Parameters<typeof createInvoiceDraft>[0], InvoiceDraft> = {
  name: "createInvoiceDraft",
  kind: "write",
  run: (input) => createInvoiceDraft(input),
};
