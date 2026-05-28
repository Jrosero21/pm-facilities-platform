"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import {
  addProposalLineItem,
  createProposal,
  createProposalRevision,
  recordProposalAcceptance,
  removeProposalLineItem,
  sendProposal,
  updateProposalDraft,
  updateProposalLineItem,
  withdrawProposal,
} from "@/server/billing/proposals";
import {
  ProposalChainHasLiveRevision,
  ProposalNotDraft,
  ProposalNotSent,
  ProposalNotWithdrawable,
} from "@/server/billing/errors";

// ── Phase 8 batch 8c.11b — PROPOSAL ACTIONS (the reshaped action template) ────────────
// The first action-layer wrappers around the 8c.5 data-layer writers. Proposals are
// operator-level → requireTenant() ONLY (no isAccountingRole — the simpler of the two
// coexisting role patterns from 8c.8). The data-layer writers are untouched; these wrap them.
//
// CATCH DISCIPLINE: a SPECIFIC allowlist only — instanceof for the F3 classes, exact-sentinel /
// known-prefix match for the generic errors → inline { error }. Anything unmatched RE-THROWS
// (never swallow programmer errors as inline text). The split: auth/tenant failure redirects
// (requireTenant backstop); operational F3 states return inline { error } for the operator.

export type ProposalActionState = { error: string } | null;

const NUM = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const OPT = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
function parseDate(v: string): Date | null {
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

// SPECIFIC allowlist → friendly message; "" means "not a known operational error" (→ caller re-throws).
function operationalMessage(e: unknown): string {
  if (e instanceof ProposalNotDraft) return "This proposal can no longer be edited (it was already sent or decided).";
  if (e instanceof ProposalNotSent) return "This proposal isn't awaiting a decision.";
  if (e instanceof ProposalNotWithdrawable) return "This proposal can no longer be withdrawn.";
  if (e instanceof ProposalChainHasLiveRevision) return "This proposal already has an active revision.";
  if (e instanceof Error) {
    if (e.message === "PROPOSAL_NOT_FOUND" || e.message === "PROPOSAL_LINE_ITEM_NOT_FOUND") {
      return "This proposal no longer exists — please reload.";
    }
    if (e.message.startsWith("INVALID_LINE_")) return "Check the line values (quantity, unit price, markup, tax).";
  }
  return "";
}

/** Create a draft proposal, then redirect to its detail. */
export async function createProposalAction(
  jobId: string,
  _prev: ProposalActionState,
  formData: FormData,
): Promise<ProposalActionState> {
  const ctx = await requireTenant();
  let newId: string;
  try {
    const r = await createProposal({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      title: OPT(formData, "title"),
      scopeSnapshot: OPT(formData, "scopeSnapshot"),
      currency: OPT(formData, "currency") ?? undefined,
      validUntil: parseDate(NUM(formData, "validUntil")),
      notes: OPT(formData, "notes"),
      createdByUserId: ctx.user.id,
    });
    newId = r.id;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
  redirect(`/jobs/${jobId}/proposals/${newId}`);
}

/** Edit a draft proposal's header. */
export async function updateProposalDraftAction(
  proposalId: string,
  jobId: string,
  _prev: ProposalActionState,
  formData: FormData,
): Promise<ProposalActionState> {
  const ctx = await requireTenant();
  try {
    await updateProposalDraft({
      tenantId: ctx.activeTenant.tenantId,
      id: proposalId,
      title: OPT(formData, "title"),
      scopeSnapshot: OPT(formData, "scopeSnapshot"),
      validUntil: parseDate(NUM(formData, "validUntil")),
      notes: OPT(formData, "notes"),
    });
    revalidatePath(`/jobs/${jobId}/proposals/${proposalId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Add a line item to a draft proposal. */
export async function addProposalLineItemAction(
  proposalId: string,
  jobId: string,
  _prev: ProposalActionState,
  formData: FormData,
): Promise<ProposalActionState> {
  const ctx = await requireTenant();
  try {
    await addProposalLineItem({
      tenantId: ctx.activeTenant.tenantId,
      proposalId,
      category: NUM(formData, "category") as Parameters<typeof addProposalLineItem>[0]["category"],
      description: NUM(formData, "description"),
      quantity: NUM(formData, "quantity") || "1",
      unit: OPT(formData, "unit"),
      unitPrice: NUM(formData, "unitPrice") || "0",
      markupPercent: OPT(formData, "markupPercent"),
      taxRate: OPT(formData, "taxRate"),
      taxAmount: NUM(formData, "taxAmount") || "0",
    });
    revalidatePath(`/jobs/${jobId}/proposals/${proposalId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Update a draft proposal's line item. */
export async function updateProposalLineItemAction(
  lineId: string,
  proposalId: string,
  jobId: string,
  _prev: ProposalActionState,
  formData: FormData,
): Promise<ProposalActionState> {
  const ctx = await requireTenant();
  try {
    await updateProposalLineItem({
      tenantId: ctx.activeTenant.tenantId,
      id: lineId,
      description: OPT(formData, "description") ?? undefined,
      quantity: OPT(formData, "quantity") ?? undefined,
      unitPrice: OPT(formData, "unitPrice") ?? undefined,
      markupPercent: OPT(formData, "markupPercent"),
      taxRate: OPT(formData, "taxRate"),
      taxAmount: OPT(formData, "taxAmount") ?? undefined,
    });
    revalidatePath(`/jobs/${jobId}/proposals/${proposalId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Remove a draft proposal's line item. (No form inputs — bound id only.) */
export async function removeProposalLineItemAction(
  lineId: string,
  proposalId: string,
  jobId: string,
): Promise<ProposalActionState> {
  const ctx = await requireTenant();
  try {
    await removeProposalLineItem({ tenantId: ctx.activeTenant.tenantId, id: lineId });
    revalidatePath(`/jobs/${jobId}/proposals/${proposalId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** draft → sent. */
export async function sendProposalAction(proposalId: string, jobId: string): Promise<ProposalActionState> {
  const ctx = await requireTenant();
  try {
    await sendProposal({ tenantId: ctx.activeTenant.tenantId, id: proposalId, actorUserId: ctx.user.id });
    revalidatePath(`/jobs/${jobId}/proposals/${proposalId}`);
    revalidatePath(`/jobs/${jobId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** sent → accepted | declined (decision bound). */
export async function recordProposalAcceptanceAction(
  proposalId: string,
  jobId: string,
  decision: "accepted" | "declined",
): Promise<ProposalActionState> {
  const ctx = await requireTenant();
  try {
    await recordProposalAcceptance({
      tenantId: ctx.activeTenant.tenantId,
      id: proposalId,
      decision,
      approverUserId: ctx.user.id,
      decidedAt: new Date(),
    });
    revalidatePath(`/jobs/${jobId}/proposals/${proposalId}`);
    revalidatePath(`/jobs/${jobId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** draft/sent/viewed → withdrawn. */
export async function withdrawProposalAction(proposalId: string, jobId: string): Promise<ProposalActionState> {
  const ctx = await requireTenant();
  try {
    await withdrawProposal({ tenantId: ctx.activeTenant.tenantId, id: proposalId, actorUserId: ctx.user.id });
    revalidatePath(`/jobs/${jobId}/proposals/${proposalId}`);
    revalidatePath(`/jobs/${jobId}`);
    return null;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
}

/** Create a revision superseding the given proposal, then redirect to the new draft. */
export async function createProposalRevisionAction(
  supersedesProposalId: string,
  jobId: string,
): Promise<ProposalActionState> {
  const ctx = await requireTenant();
  let newId: string;
  try {
    const r = await createProposalRevision({
      tenantId: ctx.activeTenant.tenantId,
      supersedesProposalId,
      actorUserId: ctx.user.id,
    });
    newId = r.id;
  } catch (e) {
    const m = operationalMessage(e);
    if (m) return { error: m };
    throw e;
  }
  redirect(`/jobs/${jobId}/proposals/${newId}`);
}
