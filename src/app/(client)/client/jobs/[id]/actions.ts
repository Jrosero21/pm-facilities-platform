"use server";

import { revalidatePath } from "next/cache";
import { requireClient } from "@/server/auth-context";
import { createClientNote } from "@/server/client/create-client-note";
import { acceptClientProposal } from "@/server/client/accept-client-proposal";

// ── Phase 11 batch 11g — CLIENT NOTE (UPDATE) WRITE ACTION ──────────────────
// Thin 'use server' wrapper mirroring createVendorNoteAction's (id, _prev,
// formData → { error }) useActionState shape. Identity comes from requireClient()'s
// ctx — tenantId, clientScope, actorUserId — NEVER from the form. jobId is the
// bound arg, re-validated ∈ scope inside createClientNote (not trusted as a grant).
// Known domain errors map to { error }; anything else re-throws.

export type ClientNoteActionResult = { error?: string };

const KNOWN_ERRORS = new Set(["CLIENT_SCOPE_MISMATCH", "JOB_NOT_FOUND"]);

function toResult(err: unknown): ClientNoteActionResult {
  const message = err instanceof Error ? err.message : String(err);
  if (KNOWN_ERRORS.has(message)) return { error: message };
  throw err;
}

export async function createClientNoteAction(
  jobId: string,
  _prev: ClientNoteActionResult | null,
  formData: FormData,
): Promise<ClientNoteActionResult> {
  const ctx = await requireClient();

  const bodyRaw = formData.get("body");
  if (typeof bodyRaw !== "string" || bodyRaw.trim().length === 0) {
    return { error: "Please enter an update." };
  }

  try {
    await createClientNote({
      tenantId: ctx.activeTenant.tenantId,
      jobId,
      clientScope: ctx.clientScope,
      actorUserId: ctx.user.id,
      body: bodyRaw.trim(),
    });
  } catch (err) {
    return toResult(err);
  }

  revalidatePath(`/client/jobs/${jobId}`);
  return {};
}

// ── Phase 11 batch 11i — PROPOSAL ACCEPT WRITE ACTION ───────────────────────
// jobId AND proposalId are bound args (the component knows both): jobId threads
// the revalidate target, proposalId is the accept target re-validated ∈ scope
// inside acceptClientProposal. Identity from ctx only. Accept-only (no reject).
// CLIENT_SCOPE_MISMATCH/PROPOSAL_NOT_FOUND → friendly generic; ProposalNotSent
// (a billing class with a dynamic message, mapped by .name) → "no longer acceptable".

export type ProposalAcceptResult = { error?: string };

export async function acceptProposalAction(
  jobId: string,
  proposalId: string,
  _prev: ProposalAcceptResult | null,
  _formData: FormData,
): Promise<ProposalAcceptResult> {
  const ctx = await requireClient();

  try {
    await acceptClientProposal({
      tenantId: ctx.activeTenant.tenantId,
      proposalId,
      clientScope: ctx.clientScope,
      actorUserId: ctx.user.id,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message = err instanceof Error ? err.message : String(err);
    if (name === "ProposalNotSent") {
      return { error: "This proposal can no longer be accepted." };
    }
    if (message === "CLIENT_SCOPE_MISMATCH" || message === "PROPOSAL_NOT_FOUND") {
      return { error: "This proposal can no longer be accepted." };
    }
    throw err;
  }

  revalidatePath(`/client/jobs/${jobId}`);
  return {};
}
