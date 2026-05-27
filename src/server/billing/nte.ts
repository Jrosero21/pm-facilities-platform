import "server-only";

import { and, asc, desc, eq, isNull, type SQL } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { clientNteRules, trades } from "@/server/schema";
import { ActivationTargetMismatch, SingleActiveInvariantViolated } from "@/server/billing/errors";

// ── Phase 8 batch 8c.1 — CLIENT NTE SUBSTRATE (Surface 23) ───────────────────────────
// The SOURCE layer for jobs.not_to_exceed_amount. This module ONLY reads/writes
// client_nte_rules (+ a read of the global `trades` for the HANDY fallback). It does NOT
// import job_scope_steps and does NOT write jobs.not_to_exceed_amount — that snapshot is
// written solely by createJob in 8c.4 (R-7.2 single writer of the snapshot).
//
// R-7.1 single-active is a WRITE-PATH invariant (no DB unique — the nullable
// client_location_id, 8b §5): at most one `active` row per
// (tenant_id, client_id, trade_id, priority_id, client_location_id). Enforced by the demote
// step in create/activate (the activateAgentPolicy template). 8c-D1: reuse the generic
// SingleActiveInvariantViolated / ActivationTargetMismatch (via billing/errors).

export type NteRuleSource =
  | "location"
  | "client_wide"
  | "handyman_location"
  | "handyman_client_wide";

export type ResolvedNte = {
  amount: string; // decimal string (no float) from nte_amount
  currency: string;
  source: NteRuleSource;
  ruleId: string; // provenance for the 8c.4 snapshot/audit
};

export type ClientNteRuleRow = {
  id: string;
  clientId: string;
  tradeId: string;
  priorityId: string;
  clientLocationId: string | null;
  nteAmount: string;
  currency: string;
  status: "active" | "archived";
  createdAt: Date;
  updatedAt: Date;
};

type RuleTuple = {
  tenantId: string;
  clientId: string;
  tradeId: string;
  priorityId: string;
  clientLocationId: string | null;
};

// NULL-aware location match — the nullable-key reason there is no DB unique (8b §5);
// mirrors the nullable-client_id handling in activateAgentPolicy.
function locMatch(clientLocationId: string | null): SQL | undefined {
  return clientLocationId === null
    ? isNull(clientNteRules.clientLocationId)
    : eq(clientNteRules.clientLocationId, clientLocationId);
}

function tupleKey(t: RuleTuple): string {
  return `(tenant=${t.tenantId}, client=${t.clientId}, trade=${t.tradeId}, priority=${t.priorityId}, location=${t.clientLocationId ?? "NULL"})`;
}

// Data-layer input validation (D-7.7) — defensive even for trusted callers; protects the
// 8c.4 createJob snapshot from malformed upstream config. Not an F3 invariant — plain Error.
function validateNteAmount(amount: string): void {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error("INVALID_NTE_AMOUNT");
  if (parseFloat(amount) <= 0) throw new Error("INVALID_NTE_AMOUNT");
  // decimal(12,2) ⇒ at most 10 integer digits.
  const intPart = (amount.split(".")[0] ?? "").replace(/^0+/, "");
  if (intPart.length > 10) throw new Error("INVALID_NTE_AMOUNT");
}

function validateCurrency(currency: string): void {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("INVALID_CURRENCY");
}

/**
 * Resolve the effective NTE for (client, trade, priority[, location]) via the A4/A5 ladder.
 * NEVER throws; null ⇒ no rule resolved (operator enters the NTE manually, A5).
 * Every client_nte_rules SELECT is tenant-scoped (Confirmation 2).
 */
export async function resolveClientNteRule(input: {
  tenantId: string;
  clientId: string;
  tradeId: string;
  priorityId: string;
  clientLocationId?: string | null;
}): Promise<ResolvedNte | null> {
  const loc = input.clientLocationId ?? null;

  const tryRung = async (
    tradeId: string,
    locationId: string | null,
    source: NteRuleSource,
  ): Promise<ResolvedNte | null> => {
    const rows = await db
      .select({
        id: clientNteRules.id,
        amount: clientNteRules.nteAmount,
        currency: clientNteRules.currency,
      })
      .from(clientNteRules)
      .where(
        and(
          eq(clientNteRules.tenantId, input.tenantId), // tenant-scoped, every rung
          eq(clientNteRules.clientId, input.clientId),
          eq(clientNteRules.tradeId, tradeId),
          eq(clientNteRules.priorityId, input.priorityId),
          locMatch(locationId),
          eq(clientNteRules.status, "active"),
        ),
      )
      .orderBy(asc(clientNteRules.createdAt)) // non-load-bearing tie-break (R-7.1 safety net)
      .limit(1);
    const r = rows[0];
    return r ? { amount: r.amount, currency: r.currency, source, ruleId: r.id } : null;
  };

  // 1–2: the job's actual trade (location-specific, then client-wide).
  if (loc !== null) {
    const hit = await tryRung(input.tradeId, loc, "location");
    if (hit) return hit;
  }
  const clientWide = await tryRung(input.tradeId, null, "client_wide");
  if (clientWide) return clientWide;

  // 3–4: HANDY fallback (8c-D3: code is "HANDY", not "HANDYMAN"). trades is global.
  const handy = await db
    .select({ id: trades.id })
    .from(trades)
    .where(eq(trades.code, "HANDY"))
    .limit(1);
  const handyId = handy[0]?.id;
  if (handyId && handyId !== input.tradeId) {
    if (loc !== null) {
      const h1 = await tryRung(handyId, loc, "handyman_location");
      if (h1) return h1;
    }
    const h2 = await tryRung(handyId, null, "handyman_client_wide");
    if (h2) return h2;
  }

  return null;
}

/**
 * Create a rule as `active`, atomically superseding the prior active for its tuple (R-7.1).
 * Throws INVALID_NTE_AMOUNT / INVALID_CURRENCY (input) and SingleActiveInvariantViolated
 * (>1 pre-existing active = corruption).
 */
export async function createClientNteRule(input: {
  tenantId: string;
  clientId: string;
  tradeId: string;
  priorityId: string;
  clientLocationId: string | null;
  nteAmount: string;
  currency?: string;
  createdByUserId: string | null;
}): Promise<{ id: string }> {
  validateNteAmount(input.nteAmount);
  const currency = input.currency ?? "USD";
  validateCurrency(currency);

  const id = uuidv7();
  await db.transaction(async (tx) => {
    const demote = await tx
      .update(clientNteRules)
      .set({ status: "archived" })
      .where(
        and(
          eq(clientNteRules.tenantId, input.tenantId),
          eq(clientNteRules.clientId, input.clientId),
          eq(clientNteRules.tradeId, input.tradeId),
          eq(clientNteRules.priorityId, input.priorityId),
          locMatch(input.clientLocationId),
          eq(clientNteRules.status, "active"),
        ),
      );
    // affectedRows is driver-mode invariant: WHERE status='active' excludes the post-state.
    const demoted = demote[0].affectedRows;
    if (demoted > 1) throw new SingleActiveInvariantViolated("client_nte_rules", tupleKey(input), demoted);

    await tx.insert(clientNteRules).values({
      id,
      tenantId: input.tenantId,
      clientId: input.clientId,
      tradeId: input.tradeId,
      priorityId: input.priorityId,
      clientLocationId: input.clientLocationId,
      nteAmount: input.nteAmount,
      currency,
      status: "active",
      createdByUserId: input.createdByUserId,
    });
  });
  return { id };
}

/**
 * Re-activate an archived rule, atomically superseding the prior active for its tuple.
 * Throws SingleActiveInvariantViolated (>1 pre-existing active) and ActivationTargetMismatch
 * (target missing / wrong tenant / wrong tuple — promote affected != 1).
 */
export async function activateClientNteRule(input: {
  tenantId: string;
  clientId: string;
  tradeId: string;
  priorityId: string;
  clientLocationId: string | null;
  id: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    // Target pre-check (lock the row): it must exist, match the FULL tuple, and be
    // `archived`. activate PROMOTES AN ARCHIVED RULE (createClientNteRule handles new-active),
    // so a missing/wrong-tuple/already-active target is an ActivationTargetMismatch. This
    // diverges from activateAgentPolicy (idempotent on an already-active target) on purpose —
    // it makes the create-vs-activate division explicit and surfaces "no archived target".
    const target = await tx
      .select({ status: clientNteRules.status })
      .from(clientNteRules)
      .where(
        and(
          eq(clientNteRules.id, input.id),
          eq(clientNteRules.tenantId, input.tenantId),
          eq(clientNteRules.clientId, input.clientId),
          eq(clientNteRules.tradeId, input.tradeId),
          eq(clientNteRules.priorityId, input.priorityId),
          locMatch(input.clientLocationId),
        ),
      )
      .for("update");
    if (!target[0] || target[0].status !== "archived") {
      throw new ActivationTargetMismatch("client_nte_rules", input.id);
    }

    const demote = await tx
      .update(clientNteRules)
      .set({ status: "archived" })
      .where(
        and(
          eq(clientNteRules.tenantId, input.tenantId),
          eq(clientNteRules.clientId, input.clientId),
          eq(clientNteRules.tradeId, input.tradeId),
          eq(clientNteRules.priorityId, input.priorityId),
          locMatch(input.clientLocationId),
          eq(clientNteRules.status, "active"),
        ),
      );
    const demoted = demote[0].affectedRows;
    if (demoted > 1) throw new SingleActiveInvariantViolated("client_nte_rules", tupleKey(input), demoted);

    const promote = await tx
      .update(clientNteRules)
      .set({ status: "active" })
      .where(
        and(
          eq(clientNteRules.id, input.id),
          eq(clientNteRules.tenantId, input.tenantId),
          eq(clientNteRules.clientId, input.clientId),
          eq(clientNteRules.tradeId, input.tradeId),
          eq(clientNteRules.priorityId, input.priorityId),
          locMatch(input.clientLocationId),
        ),
      );
    if (promote[0].affectedRows !== 1) throw new ActivationTargetMismatch("client_nte_rules", input.id);
  });
}

/** Retire a rule (active|archived → archived). No single-active concern (lowers active count). */
export async function archiveClientNteRule(input: {
  tenantId: string;
  id: string;
}): Promise<void> {
  const res = await db
    .update(clientNteRules)
    .set({ status: "archived" })
    .where(and(eq(clientNteRules.tenantId, input.tenantId), eq(clientNteRules.id, input.id)));
  if (res[0].affectedRows === 0) throw new Error("CLIENT_NTE_RULE_NOT_FOUND");
}

/** Admin listing for a client (all statuses), newest first. */
export async function listClientNteRules(
  tenantId: string,
  clientId: string,
): Promise<ClientNteRuleRow[]> {
  return db
    .select({
      id: clientNteRules.id,
      clientId: clientNteRules.clientId,
      tradeId: clientNteRules.tradeId,
      priorityId: clientNteRules.priorityId,
      clientLocationId: clientNteRules.clientLocationId,
      nteAmount: clientNteRules.nteAmount,
      currency: clientNteRules.currency,
      status: clientNteRules.status,
      createdAt: clientNteRules.createdAt,
      updatedAt: clientNteRules.updatedAt,
    })
    .from(clientNteRules)
    .where(and(eq(clientNteRules.tenantId, tenantId), eq(clientNteRules.clientId, clientId)))
    .orderBy(desc(clientNteRules.createdAt));
}
