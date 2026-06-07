import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { auditLogs, clientBillingRules } from "@/server/schema";
import { isDecimalStr } from "@/server/billing/money";

// ── CF-27.7 Seam 0 — CLIENT BILLING-RULE (markup) WRITER ──────────────────────────────
// The authoring layer for client_billing_rules — the SOURCE of resolveClientMarkupDefault
// (client-invoices.ts), which reads the single is_default + active row per client and snapshots its
// markup_percent onto proposal/invoice lines. Mirrors billing/nte.ts: tenant-scoped, audit-in-txn,
// named-error throwing. NO migration (the table exists since Phase 2). NO trade/priority dimension —
// markup keys on the client (one default per client), unlike the NTE 4-rung tuple.
//
// READ-SIDE CONTRACT: createClientBillingRule with isDefault=true produces a row resolveClientMarkup-
// Default will pick up (is_default + status='active' + non-null markup_percent) → margin flows.

export type ClientBillingRuleRow = {
  id: string;
  clientId: string;
  name: string;
  markupPercent: string | null;
  paymentTermsDays: number | null;
  isTaxExempt: boolean;
  emergencyNteMultiplier: string | null;
  isDefault: boolean;
  status: "active" | "inactive" | "archived";
  createdAt: Date;
  updatedAt: Date;
};

// markup_percent decimal(6,3) ⇒ maxIntDigits 3, scale 3 (0…999.999, non-negative — isDecimalStr).
function validateMarkup(v: string): void {
  if (!v) throw new Error("MARKUP_REQUIRED");
  if (!isDecimalStr(v, 3, 3)) throw new Error("MARKUP_INVALID");
}
function validatePaymentTerms(v: number | null | undefined): void {
  if (v == null) return;
  if (!Number.isInteger(v) || v < 0) throw new Error("PAYMENT_TERMS_INVALID");
}
// emergency_nte_multiplier decimal(4,2) ⇒ maxIntDigits 2, scale 2 (0…99.99).
function validateEmergencyMultiplier(v: string | null | undefined): void {
  if (v == null) return;
  if (!isDecimalStr(v, 2, 2)) throw new Error("EMERGENCY_MULTIPLIER_INVALID");
}

/** Admin listing for a client (all statuses), newest first. */
export async function listClientBillingRules(
  tenantId: string,
  clientId: string,
): Promise<ClientBillingRuleRow[]> {
  return db
    .select({
      id: clientBillingRules.id,
      clientId: clientBillingRules.clientId,
      name: clientBillingRules.name,
      markupPercent: clientBillingRules.markupPercent,
      paymentTermsDays: clientBillingRules.paymentTermsDays,
      isTaxExempt: clientBillingRules.isTaxExempt,
      emergencyNteMultiplier: clientBillingRules.emergencyNteMultiplier,
      isDefault: clientBillingRules.isDefault,
      status: clientBillingRules.status,
      createdAt: clientBillingRules.createdAt,
      updatedAt: clientBillingRules.updatedAt,
    })
    .from(clientBillingRules)
    .where(and(eq(clientBillingRules.tenantId, tenantId), eq(clientBillingRules.clientId, clientId)))
    .orderBy(desc(clientBillingRules.createdAt));
}

/**
 * Create an active billing rule. If isDefault, atomically demotes any prior is_default+active rule
 * for the client (the single-default invariant — no DB unique, enforced here). Audit inside the txn.
 * Throws NAME_REQUIRED, MARKUP_REQUIRED, MARKUP_INVALID, PAYMENT_TERMS_INVALID, EMERGENCY_MULTIPLIER_INVALID.
 */
export async function createClientBillingRule(input: {
  tenantId: string;
  clientId: string;
  actorUserId: string | null;
  name: string;
  markupPercent: string;
  paymentTermsDays?: number | null;
  isTaxExempt?: boolean;
  emergencyNteMultiplier?: string | null;
  isDefault: boolean;
}): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("NAME_REQUIRED");
  validateMarkup(input.markupPercent);
  validatePaymentTerms(input.paymentTermsDays);
  validateEmergencyMultiplier(input.emergencyNteMultiplier);

  const id = uuidv7();
  await db.transaction(async (tx) => {
    if (input.isDefault) {
      // demote the prior default(s) for this client — keeps one is_default+active per client.
      await tx
        .update(clientBillingRules)
        .set({ isDefault: false })
        .where(
          and(
            eq(clientBillingRules.tenantId, input.tenantId),
            eq(clientBillingRules.clientId, input.clientId),
            eq(clientBillingRules.isDefault, true),
            eq(clientBillingRules.status, "active"),
          ),
        );
    }
    await tx.insert(clientBillingRules).values({
      id,
      tenantId: input.tenantId,
      clientId: input.clientId,
      name,
      markupPercent: input.markupPercent,
      paymentTermsDays: input.paymentTermsDays ?? null,
      isTaxExempt: input.isTaxExempt ?? false,
      emergencyNteMultiplier: input.emergencyNteMultiplier ?? null,
      isDefault: input.isDefault,
      status: "active",
      createdByUserId: input.actorUserId,
    });
    // config-level lifecycle → audit_logs (not a job-scoped billing event). Inside the tx (R-6.7).
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId, userId: input.actorUserId,
      action: "client_billing_rule.created", targetType: "client_billing_rule", targetId: id,
      metadata: {
        clientId: input.clientId, name, markupPercent: input.markupPercent,
        paymentTermsDays: input.paymentTermsDays ?? null, isDefault: input.isDefault,
      },
    });
  });
  return { id };
}

/**
 * Make a rule the client's default (must be active, this client). Atomically demotes the prior
 * default. Audit inside the txn. Throws CLIENT_BILLING_RULE_NOT_FOUND, CLIENT_BILLING_RULE_NOT_ACTIVE.
 */
export async function setDefaultClientBillingRule(input: {
  tenantId: string;
  clientId: string;
  ruleId: string;
  actorUserId: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const target = (
      await tx
        .select({ status: clientBillingRules.status, clientId: clientBillingRules.clientId })
        .from(clientBillingRules)
        .where(
          and(
            eq(clientBillingRules.tenantId, input.tenantId),
            eq(clientBillingRules.id, input.ruleId),
            eq(clientBillingRules.clientId, input.clientId),
          ),
        )
        .for("update")
    )[0];
    if (!target) throw new Error("CLIENT_BILLING_RULE_NOT_FOUND");
    if (target.status !== "active") throw new Error("CLIENT_BILLING_RULE_NOT_ACTIVE");

    await tx
      .update(clientBillingRules)
      .set({ isDefault: false })
      .where(
        and(
          eq(clientBillingRules.tenantId, input.tenantId),
          eq(clientBillingRules.clientId, input.clientId),
          eq(clientBillingRules.isDefault, true),
          eq(clientBillingRules.status, "active"),
        ),
      );
    await tx
      .update(clientBillingRules)
      .set({ isDefault: true })
      .where(and(eq(clientBillingRules.tenantId, input.tenantId), eq(clientBillingRules.id, input.ruleId)));
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId, userId: input.actorUserId,
      action: "client_billing_rule.set_default", targetType: "client_billing_rule", targetId: input.ruleId,
      metadata: { clientId: input.clientId },
    });
  });
}

/** Retire a rule (→ archived, and clears is_default). Audit inside the txn.
 *  Throws CLIENT_BILLING_RULE_NOT_FOUND. */
export async function archiveClientBillingRule(input: {
  tenantId: string;
  ruleId: string;
  actorUserId: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const rule = (
      await tx
        .select({ clientId: clientBillingRules.clientId })
        .from(clientBillingRules)
        .where(and(eq(clientBillingRules.tenantId, input.tenantId), eq(clientBillingRules.id, input.ruleId)))
        .for("update")
    )[0];
    if (!rule) throw new Error("CLIENT_BILLING_RULE_NOT_FOUND");
    await tx
      .update(clientBillingRules)
      .set({ status: "archived", isDefault: false })
      .where(and(eq(clientBillingRules.tenantId, input.tenantId), eq(clientBillingRules.id, input.ruleId)));
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId, userId: input.actorUserId,
      action: "client_billing_rule.archived", targetType: "client_billing_rule", targetId: input.ruleId,
      metadata: { clientId: rule.clientId },
    });
  });
}
