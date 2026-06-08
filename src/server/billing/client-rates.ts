import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { auditLogs, clientRates, clients, trades } from "@/server/schema";
import { getTrade } from "@/server/trades";
import { isDecimalStr } from "@/server/billing/money";

// ── Phase (i) rate-sheet (0049) — CLIENT RATE-SHEET WRITER ─────────────────────────────
// The authoring layer for client_rates — per-client per-trade AGREED BILLED RATES (e.g. HVAC $95/hr).
// Mirrors billing/billing-rules.ts: tenant-scoped, audit-in-txn, named-error throwing, isDecimalStr
// validation. STORAGE ONLY — nothing here resolves a rate into a billed line; that (most-specific /
// newest-wins resolution + line authoring) is Phase (ii).
//
// NO is_default concept (unlike billing rules): multiple active rates coexist — typically one per
// (trade × rate_type). Overlapping active rates are ALLOWED (newest-wins at resolution is Phase ii's
// concern); this writer enforces no uniqueness. Also includes the billing-model selector writer.

const RATE_TYPES = ["hourly", "flat", "trip_charge", "per_unit", "emergency", "after_hours"] as const;
export type RateType = (typeof RATE_TYPES)[number];
const RATE_TYPE_SET: ReadonlySet<string> = new Set(RATE_TYPES);

const BILLING_MODELS = ["rate_sheet", "cost_plus", "flat"] as const;
export type BillingModel = (typeof BILLING_MODELS)[number];
const BILLING_MODEL_SET: ReadonlySet<string> = new Set(BILLING_MODELS);

// amount decimal(12,2) ⇒ maxIntDigits 10, scale 2; a billed rate must be POSITIVE.
function validateAmount(v: string): void {
  if (!v || !isDecimalStr(v, 10, 2) || parseFloat(v) <= 0) throw new Error("AMOUNT_INVALID");
}

export type ClientRateRow = {
  id: string;
  clientId: string;
  tradeId: string | null;
  tradeName: string | null;
  rateType: RateType;
  amount: string;
  currency: string;
  unit: string | null;
  effectiveDate: Date | null;
  expiryDate: Date | null;
  notes: string | null;
  status: "active" | "inactive" | "archived";
  createdAt: Date;
  updatedAt: Date;
};

/** All rates for a client (all statuses), newest first, with the trade display name joined
 *  (null for a general / all-trade rate). LEFT join — trade_id is nullable. */
export async function listClientRates(tenantId: string, clientId: string): Promise<ClientRateRow[]> {
  return db
    .select({
      id: clientRates.id,
      clientId: clientRates.clientId,
      tradeId: clientRates.tradeId,
      tradeName: trades.name,
      rateType: clientRates.rateType,
      amount: clientRates.amount,
      currency: clientRates.currency,
      unit: clientRates.unit,
      effectiveDate: clientRates.effectiveDate,
      expiryDate: clientRates.expiryDate,
      notes: clientRates.notes,
      status: clientRates.status,
      createdAt: clientRates.createdAt,
      updatedAt: clientRates.updatedAt,
    })
    .from(clientRates)
    .leftJoin(trades, eq(trades.id, clientRates.tradeId))
    .where(and(eq(clientRates.tenantId, tenantId), eq(clientRates.clientId, clientId)))
    .orderBy(desc(clientRates.createdAt));
}

/**
 * Create an active rate. trade_id null = a general (all-trade) rate. unit is recommended when
 * rate_type='per_unit' but not required. Audit inside the txn. Throws RATE_TYPE_INVALID,
 * AMOUNT_INVALID, TRADE_NOT_FOUND.
 */
export async function createClientRate(input: {
  tenantId: string;
  clientId: string;
  actorUserId: string | null;
  tradeId?: string | null;
  rateType: string;
  amount: string;
  unit?: string | null;
  effectiveDate?: Date | null; // drizzle `date` is mode-'date' — the action parses 'YYYY-MM-DD' → Date
  expiryDate?: Date | null;
  notes?: string | null;
}): Promise<{ id: string }> {
  if (!RATE_TYPE_SET.has(input.rateType)) throw new Error("RATE_TYPE_INVALID");
  validateAmount(input.amount);
  if (input.tradeId) {
    const t = await getTrade(input.tradeId);
    if (!t) throw new Error("TRADE_NOT_FOUND");
  }

  const id = uuidv7();
  await db.transaction(async (tx) => {
    await tx.insert(clientRates).values({
      id,
      tenantId: input.tenantId,
      clientId: input.clientId,
      tradeId: input.tradeId ?? null,
      rateType: input.rateType as RateType,
      amount: input.amount,
      // currency omitted → DB default 'USD'.
      unit: input.unit ?? null,
      effectiveDate: input.effectiveDate ?? null,
      expiryDate: input.expiryDate ?? null,
      notes: input.notes ?? null,
      status: "active",
      createdByUserId: input.actorUserId,
    });
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId, userId: input.actorUserId,
      action: "client_rate.created", targetType: "client_rate", targetId: id,
      metadata: {
        clientId: input.clientId, tradeId: input.tradeId ?? null,
        rateType: input.rateType, amount: input.amount, unit: input.unit ?? null,
      },
    });
  });
  return { id };
}

/** Retire a rate (→ archived). Audit inside the txn. Throws CLIENT_RATE_NOT_FOUND. */
export async function archiveClientRate(input: {
  tenantId: string;
  rateId: string;
  actorUserId: string | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const rate = (
      await tx
        .select({ clientId: clientRates.clientId })
        .from(clientRates)
        .where(and(eq(clientRates.tenantId, input.tenantId), eq(clientRates.id, input.rateId)))
        .for("update")
    )[0];
    if (!rate) throw new Error("CLIENT_RATE_NOT_FOUND");
    await tx
      .update(clientRates)
      .set({ status: "archived" })
      .where(and(eq(clientRates.tenantId, input.tenantId), eq(clientRates.id, input.rateId)));
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId, userId: input.actorUserId,
      action: "client_rate.archived", targetType: "client_rate", targetId: input.rateId,
      metadata: { clientId: rate.clientId },
    });
  });
}

/**
 * Set the client's billing model (rate_sheet | cost_plus | flat) — the selector's writer. No-op
 * when unchanged. Audit (from→to) inside the txn. Throws BILLING_MODEL_INVALID, CLIENT_NOT_FOUND.
 */
export async function setClientBillingModel(input: {
  tenantId: string;
  clientId: string;
  actorUserId: string | null;
  billingModel: string;
}): Promise<void> {
  if (!BILLING_MODEL_SET.has(input.billingModel)) throw new Error("BILLING_MODEL_INVALID");
  await db.transaction(async (tx) => {
    const cur = (
      await tx
        .select({ billingModel: clients.billingModel })
        .from(clients)
        .where(and(eq(clients.tenantId, input.tenantId), eq(clients.id, input.clientId)))
        .for("update")
    )[0];
    if (!cur) throw new Error("CLIENT_NOT_FOUND");
    if (cur.billingModel === input.billingModel) return; // no-op — no write, no audit.

    await tx
      .update(clients)
      .set({ billingModel: input.billingModel as BillingModel })
      .where(and(eq(clients.tenantId, input.tenantId), eq(clients.id, input.clientId)));
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId, userId: input.actorUserId,
      action: "client.billing_model_changed", targetType: "client", targetId: input.clientId,
      metadata: { from: cur.billingModel, to: input.billingModel },
    });
  });
}
