import "server-only";

import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { auditLogs, clientRates, clients, jobs, trades } from "@/server/schema";
import { getTrade, listActiveTrades } from "@/server/trades";
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

/**
 * Set the per-client "require vendor invoice for cost-plus billing" toggle (Phase iii Part 2). ADVISORY
 * only — it governs whether Part 3's reminder fires at cost-plus invoice issuance; it NEVER blocks
 * billing. No-op when unchanged. Audit (from→to) inside the txn. Throws CLIENT_NOT_FOUND. Mirrors
 * setClientBillingModel.
 */
export async function setClientRequireVendorInvoiceForCostPlus(input: {
  tenantId: string;
  clientId: string;
  actorUserId: string | null;
  value: boolean;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const cur = (
      await tx
        .select({ value: clients.requireVendorInvoiceForCostPlus })
        .from(clients)
        .where(and(eq(clients.tenantId, input.tenantId), eq(clients.id, input.clientId)))
        .for("update")
    )[0];
    if (!cur) throw new Error("CLIENT_NOT_FOUND");
    if (cur.value === input.value) return; // no-op — no write, no audit.

    await tx
      .update(clients)
      .set({ requireVendorInvoiceForCostPlus: input.value })
      .where(and(eq(clients.tenantId, input.tenantId), eq(clients.id, input.clientId)));
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId, userId: input.actorUserId,
      action: "client.require_vendor_invoice_for_cost_plus_changed", targetType: "client", targetId: input.clientId,
      metadata: { from: cur.value, to: input.value },
    });
  });
}

// ── Phase (ii) billing-from-rates (Unit 1) — LABOR-RATE RESOLUTION ─────────────────────
// The READ side of the rate sheet: turn (client, trade, rate_type) into the AGREED billed rate,
// for rate_sheet clients. Mirrors resolveClientNteRule's specific→general ladder, but the
// tie-break is NEWEST-active-wins (desc created_at) — a re-priced sheet supersedes the old row
// (deliberately the OPPOSITE of NTE's earliest-wins: a rate sheet is re-quoted; an NTE rule is
// demoted). A DEFAULT only — never a lock; the operator's explicit unit_price always wins
// (money-safety, same principle as NTE). LABOR-only for v1 (+ trip → trip_charge, a clean map);
// materials/fee/permit/tax/equipment/other are judgment, never auto-resolved.

/**
 * Resolve the agreed billed rate for (client, trade, rate_type) — date-valid + active.
 *  Rung 1 — trade-specific (trade_id = tradeId); Rung 2 (fallback) — general (trade_id IS NULL).
 *  Within a rung: NEWEST-by-created_at wins. null ⇒ no rate (operator authors manually).
 *  date-valid = (effective_date IS NULL OR ≤ today) AND (expiry_date IS NULL OR ≥ today),
 *  evaluated against the DB's CURDATE(). Tenant-scoped on every rung. rateType defaults 'hourly'
 *  but accepts any type (so trip_charge / emergency / after_hours resolve too). Pure read.
 */
export async function resolveClientLaborRate(input: {
  tenantId: string;
  clientId: string;
  tradeId: string;
  rateType?: RateType;
}): Promise<string | null> {
  const rateType = input.rateType ?? "hourly";
  const dateValid = sql`(${clientRates.effectiveDate} is null or ${clientRates.effectiveDate} <= curdate())
    and (${clientRates.expiryDate} is null or ${clientRates.expiryDate} >= curdate())`;

  const tryRung = async (tradeMatch: SQL): Promise<string | null> => {
    const rows = await db
      .select({ amount: clientRates.amount })
      .from(clientRates)
      .where(
        and(
          eq(clientRates.tenantId, input.tenantId), // tenant-scoped, every rung
          eq(clientRates.clientId, input.clientId),
          tradeMatch,
          eq(clientRates.rateType, rateType),
          eq(clientRates.status, "active"),
          dateValid,
        ),
      )
      .orderBy(desc(clientRates.createdAt)) // newest-active-wins (re-priced sheet supersedes)
      .limit(1);
    return rows[0]?.amount ?? null;
  };

  // Rung 1: the line's actual trade. Rung 2: the client's general (all-trade) rate.
  const specific = await tryRung(eq(clientRates.tradeId, input.tradeId));
  if (specific !== null) return specific;
  return tryRung(isNull(clientRates.tradeId));
}

/** Per-job override precedence (Phase ii): the job's own model wins, else the client's. Pure. */
export function resolveEffectiveBillingModel(
  jobBillingModel: BillingModel | null,
  clientBillingModel: BillingModel,
): BillingModel {
  return jobBillingModel ?? clientBillingModel;
}

/** Load the line-pricing billing context for a job: the client it bills to + the EFFECTIVE billing
 *  model (job override ?? client default), via one tenant-scoped join. null ⇒ job missing. */
export async function loadJobBillingContext(input: {
  tenantId: string;
  jobId: string;
}): Promise<{ clientId: string; billingModel: BillingModel } | null> {
  const row = (
    await db
      .select({
        clientId: jobs.clientId,
        jobBillingModel: jobs.billingModel,
        clientBillingModel: clients.billingModel,
      })
      .from(jobs)
      .innerJoin(clients, and(eq(clients.tenantId, jobs.tenantId), eq(clients.id, jobs.clientId)))
      .where(and(eq(jobs.tenantId, input.tenantId), eq(jobs.id, input.jobId)))
      .limit(1)
  )[0];
  if (!row) return null;
  return {
    clientId: row.clientId,
    billingModel: resolveEffectiveBillingModel(row.jobBillingModel, row.clientBillingModel),
  };
}

// v1 resolvable categories → the rate_type each resolves at. A category ABSENT here NEVER
// auto-resolves (materials/fee/permit/tax/equipment/other = judgment, operator/agent authored).
const RESOLVABLE_CATEGORY_RATE_TYPE: Readonly<Record<string, RateType>> = {
  labor: "hourly",
  trip: "trip_charge",
};

/** The rate_type a resolvable category defaults to (labor→hourly, trip→trip_charge); null when the
 *  category never auto-resolves. Exported so an add-line writer can record provenance rate_type for an
 *  EXPLICIT agreed-rate line (the resolved price passed back as a unit_price — Phase ii Unit 2a)
 *  without re-deriving the mapping. */
export function defaultRateTypeForCategory(category: string): RateType | null {
  return RESOLVABLE_CATEGORY_RATE_TYPE[category] ?? null;
}

/** The rate-resolved DEFAULT for a labor line: unit_price + forced-null markup + provenance. */
export type ResolvedLaborLine = {
  unitPrice: string;
  markupPercent: null; // an agreed rate has margin baked in — never marked up again
  tradeId: string;
  rateType: RateType;
};

/**
 * The DEFAULT-fill for a rate_sheet labor line. Returns a resolved unit_price ONLY when ALL hold:
 *  the operator passed NO explicit unit_price (operator always wins); the category is resolvable
 *  (labor → hourly, trip → trip_charge; an explicit rateType may override within those, e.g.
 *  emergency/after_hours); a trade is known; the job's EFFECTIVE billing model is 'rate_sheet';
 *  and an agreed rate actually resolves. In EVERY other case returns null = "leave pricing to the
 *  caller / operator" — which covers cost_plus, flat, materials, and no-rate-on-file. NEVER a lock.
 *  Consumed by the three AR add-line writers (proposal / client-invoice / change-order).
 */
export async function resolveLaborLineDefault(input: {
  tenantId: string;
  jobId: string;
  category: string;
  explicitUnitPrice?: string;
  tradeId?: string | null;
  rateType?: RateType;
}): Promise<ResolvedLaborLine | null> {
  if (input.explicitUnitPrice !== undefined) return null; // operator's explicit price always wins
  if (!input.tradeId) return null; // need a trade to resolve a rate
  const defaultRateType = RESOLVABLE_CATEGORY_RATE_TYPE[input.category];
  if (!defaultRateType) return null; // category not labor/trip → judgment, never auto-resolved
  const rateType = input.rateType ?? defaultRateType;

  const ctx = await loadJobBillingContext({ tenantId: input.tenantId, jobId: input.jobId });
  if (!ctx || ctx.billingModel !== "rate_sheet") return null; // only rate_sheet branches here

  const amount = await resolveClientLaborRate({
    tenantId: input.tenantId,
    clientId: ctx.clientId,
    tradeId: input.tradeId,
    rateType,
  });
  if (amount === null) return null; // no agreed rate on file → operator authors manually

  return { unitPrice: amount, markupPercent: null, tradeId: input.tradeId, rateType };
}

// ── Phase (ii) Unit 2a — agreed-rate PROVENANCE for an EXPLICIT-price line ───────────────
// resolveLaborLineDefault short-circuits the moment an explicit unit_price is present (the operator
// always wins), so it can NOT confirm provenance for a line whose price was passed back explicitly —
// which is exactly the pre-fill shape: the review editor seeds the resolved rate as the unit_price,
// the operator approves it unchanged, and publish bills that explicit number. The two functions below
// re-derive provenance for that case. Both RE-RESOLVE server-side and never trust a caller-supplied
// provenance tag (money-safety): a typed-over price no longer equals the agreed rate → no provenance.

/**
 * Confirm an EXPLICIT unit_price IS the agreed rate for (job, category, claimed trade) — so an
 * agreed-rate line whose price was passed back explicitly (the Unit 2a pre-fill / manual rate-pick)
 * still records trade_id/rate_type provenance and bills at no markup. Returns the provenance ONLY
 * when ALL hold: a trade is claimed; the category is resolvable (labor/trip); the job's EFFECTIVE
 * billing model is 'rate_sheet'; a rate is on file; and explicitUnitPrice EQUALS it (string-exact,
 * the stored decimal). In EVERY other case returns null — a typed-over / non-agreed price is just an
 * operator-authored number (no provenance, normal markup). Never a lock; never trusts the caller.
 */
export async function resolveAgreedRateProvenance(input: {
  tenantId: string;
  jobId: string;
  category: string;
  explicitUnitPrice: string;
  tradeId?: string | null;
  rateType?: RateType;
}): Promise<{ tradeId: string; rateType: RateType } | null> {
  if (!input.tradeId) return null;
  const defaultRateType = RESOLVABLE_CATEGORY_RATE_TYPE[input.category];
  if (!defaultRateType) return null; // not labor/trip → judgment, no provenance
  const rateType = input.rateType ?? defaultRateType;

  const ctx = await loadJobBillingContext({ tenantId: input.tenantId, jobId: input.jobId });
  if (!ctx || ctx.billingModel !== "rate_sheet") return null; // only rate_sheet bills the agreed rate

  const amount = await resolveClientLaborRate({
    tenantId: input.tenantId,
    clientId: ctx.clientId,
    tradeId: input.tradeId,
    rateType,
  });
  if (amount === null) return null; // no agreed rate on file
  return amount === input.explicitUnitPrice ? { tradeId: input.tradeId, rateType } : null;
}

/**
 * Per-line BILLED markup for AR content priced on a rate_sheet-capable job: "0" for a CONFIRMED
 * agreed-rate labor/trip line (explicit price == the resolved rate for its claimed trade — margin
 * baked in), else ruleMarkupPercent. Aligned by index. SHARED by the proposal routing PREVIEW and the
 * PUBLISH gate so their totals can never diverge (preview ≡ publish), and consistent with what
 * addProposalLineItem persists (it independently re-derives the same provenance). A line with no
 * claimed trade is always the rule markup — the common, untouched path.
 */
export async function resolveAgreedRateLineMarkups(input: {
  tenantId: string;
  jobId: string;
  ruleMarkupPercent: string | null;
  lines: { category: string; unitPrice: string; tradeId?: string | null; rateType?: RateType }[];
}): Promise<(string | null)[]> {
  return Promise.all(
    input.lines.map(async (ln) => {
      if (!ln.tradeId) return input.ruleMarkupPercent;
      const prov = await resolveAgreedRateProvenance({
        tenantId: input.tenantId,
        jobId: input.jobId,
        category: ln.category,
        explicitUnitPrice: ln.unitPrice,
        tradeId: ln.tradeId,
        rateType: ln.rateType,
      });
      return prov ? null : input.ruleMarkupPercent; // agreed rate → no markup (null ≡ "0" in the math)
    }),
  );
}

/** What a line-item editor needs to offer the rate-fill affordance: whether this job bills from a
 *  rate sheet at all, the trade to default the picker to (the job's primary trade), and the trade
 *  options. enabled=false ⇒ the editor stays exactly as before (no picker, manual price). */
export type LaborRatePickerContext = {
  enabled: boolean;
  defaultTradeId: string | null;
  trades: { id: string; name: string }[];
};

/**
 * Load the editor's rate-fill context for a job. enabled is true ONLY when the job's EFFECTIVE
 * billing model is 'rate_sheet' (job override ?? client default) — in which case the trade list is
 * loaded and the picker defaults to the job's primary trade. For cost_plus / flat it short-circuits
 * to disabled WITHOUT loading trades. One tenant-scoped join + (when enabled) the global trade read.
 */
export async function loadLaborRatePickerContext(input: {
  tenantId: string;
  jobId: string;
}): Promise<LaborRatePickerContext> {
  const row = (
    await db
      .select({
        jobBillingModel: jobs.billingModel,
        clientBillingModel: clients.billingModel,
        primaryTradeId: jobs.primaryTradeId,
      })
      .from(jobs)
      .innerJoin(clients, and(eq(clients.tenantId, jobs.tenantId), eq(clients.id, jobs.clientId)))
      .where(and(eq(jobs.tenantId, input.tenantId), eq(jobs.id, input.jobId)))
      .limit(1)
  )[0];
  if (!row || resolveEffectiveBillingModel(row.jobBillingModel, row.clientBillingModel) !== "rate_sheet") {
    return { enabled: false, defaultTradeId: null, trades: [] };
  }
  const trades = await listActiveTrades();
  return {
    enabled: true,
    defaultTradeId: row.primaryTradeId,
    trades: trades.map((t) => ({ id: t.id, name: t.name })),
  };
}
