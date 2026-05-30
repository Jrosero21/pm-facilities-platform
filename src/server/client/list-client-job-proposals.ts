import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { proposals } from "@/server/schema";
import { getClientJobDetail } from "@/server/client/get-client-job-detail";

export type ClientJobProposalRow = {
  id: string;
  title: string | null;
  revisionNumber: number;
  total: string;
  currency: string;
  validUntil: Date | null;
  sentAt: Date | null;
};

/**
 * Acceptable proposals for one of the client's jobs — Phase 11 batch 11i.
 *
 * Scope-guarded via getClientJobDetail (the single isolation truth — tenant +
 * clientScope.has(clientId)); returns [] if the job is not in scope so proposals
 * for another client's job never leak.
 *
 * status='sent' ONLY (J4): the acceptable set. Drafts (operator workspace),
 * accepted/declined/superseded/withdrawn/expired are not actionable here.
 *
 * OQ-6 (same as client invoices): proposals carry subtotal/markup_total/tax_total/
 * total, but the client sees the marked-up TOTAL only — subtotal/markup are NOT
 * selected. No line items. Proposals have no number column; the summary uses
 * title + revision_number.
 */
export async function listClientJobProposals(
  tenantId: string,
  jobId: string,
  clientScope: Set<string>,
): Promise<ClientJobProposalRow[]> {
  const detail = await getClientJobDetail(tenantId, jobId, clientScope);
  if (!detail) return [];

  return db
    .select({
      id: proposals.id,
      title: proposals.title,
      revisionNumber: proposals.revisionNumber,
      total: proposals.total,
      currency: proposals.currency,
      validUntil: proposals.validUntil,
      sentAt: proposals.sentAt,
    })
    .from(proposals)
    .where(
      and(
        eq(proposals.tenantId, tenantId),
        eq(proposals.jobId, jobId),
        eq(proposals.status, "sent"),
      ),
    )
    .orderBy(asc(proposals.sentAt), asc(proposals.id));
}
