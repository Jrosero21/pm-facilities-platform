import "server-only";

import { openRun, closeRun, logDecision, registerTool } from "@/server/agents/runner";
import { resolveActivePrompt } from "@/server/agents/config/prompts";
import { resolveAgentPolicy } from "@/server/agents/config/policies";
import { resolveClientMarkupDefault } from "@/server/billing/client-invoices";
import {
  loadJobBillingContext,
  resolveClientLaborRate,
  defaultRateTypeForCategory,
  type RateType,
} from "@/server/billing/client-rates";
import { selectFewShotPairs, invoiceCorrectionPairs } from "@/server/analytics/correction-pairs";
import {
  getJobDetailTool,
  getVendorInvoiceTool,
  listVendorInvoiceLineItemsTool,
  getJobStatusCodeTool,
  createInvoiceDraftTool,
} from "./tools";
import { generateInvoice, resolveInvoiceRouting } from "./llm";
import type { ProposedInvoice, ProposedInvoiceLine } from "./drafts";

// invoice_creator_v1 — the first v2.9.0 "new agent". Fixed pipeline on the shared runner:
// openRun → read context (job + vendor invoice + lines + status code, all auto-logged) →
// eligibility gate (job COMPLETED) → resolve DB prompt + policy → LLM transform (PHRASING
// ONLY) → JOIN the vendor numbers in → decision → write draft (auto-logged) → closeRun. The
// agent writes ONLY the draft at pending_review; it has NO path to client_invoices — that is
// the human-gated publish action (2b-ii). §2.9 / R-6.15: ALWAYS queues for review.
//
// MONEY-SAFETY (D1/D2/D3): the LLM emits no numbers. After generate, every dollar figure is
// JOINED IN from the vendor lines (cost basis); markup_percent is the rule's default for
// PREVIEW only (D2 — publish re-resolves fresh). A lumped vendor invoice stays ONE line at the
// vendor total (D3 — never split into invented sub-numbers).
export const AGENT_ID = "invoice_creator_v1";

/**
 * Run the invoice creator against a submitted vendor invoice on a completed job. Produces a
 * draft at pending_review. Logs the full audit chain. On any failure the run closes
 * status='failed' and the error is re-thrown for the caller to surface.
 *
 * Throws: JOB_NOT_FOUND, VENDOR_INVOICE_NOT_FOUND, JOB_NOT_COMPLETED, NoActivePromptError
 * (real path, fail-closed) + any LLM/provider error.
 */
export async function runInvoiceCreator(input: {
  tenantId: string;
  jobId: string;
  vendorInvoiceId: string;
  triggeredByUserId?: string | null;
}): Promise<{ runId: string; draftId: string }> {
  const ctx = await openRun({
    tenantId: input.tenantId,
    agentId: AGENT_ID,
    triggeredByUserId: input.triggeredByUserId ?? null,
    jobId: input.jobId,
    triggerSource: "operator_manual",
    inputSummary: `Draft client invoice from vendor invoice ${input.vendorInvoiceId}`,
  });

  try {
    // read-broad (each call auto-logged to agent_tool_calls)
    const readJob = registerTool(ctx, getJobDetailTool);
    const readVendorInvoice = registerTool(ctx, getVendorInvoiceTool);
    const readVendorLines = registerTool(ctx, listVendorInvoiceLineItemsTool);
    const readStatusCode = registerTool(ctx, getJobStatusCodeTool);

    const job = await readJob({ tenantId: input.tenantId, jobId: input.jobId });
    if (!job) throw new Error("JOB_NOT_FOUND");

    const vendorInvoice = await readVendorInvoice({ tenantId: input.tenantId, id: input.vendorInvoiceId });
    // The vendor invoice must exist AND belong to this job (no cross-job invoicing).
    if (!vendorInvoice || vendorInvoice.jobId !== input.jobId) throw new Error("VENDOR_INVOICE_NOT_FOUND");
    const vendorLines = await readVendorLines({ tenantId: input.tenantId, vendorInvoiceId: input.vendorInvoiceId });

    // ELIGIBILITY GATE: a submitted vendor invoice on a COMPLETED job (stable status code, not
    // the tenant-editable name). Not gated on sign-off / required-docs (unmodeled — 26a).
    const statusCode = await readStatusCode({ tenantId: input.tenantId, jobId: input.jobId });
    if (statusCode !== "COMPLETED") throw new Error("JOB_NOT_COMPLETED");

    const clientId = job.clientId;

    // Resolve routing once; the real path resolves the DB prompt (fail-closed), the mock path
    // skips it and records prompt_version='mock'.
    const routing = resolveInvoiceRouting();
    let systemPrompt = "";
    let promptVersion = "mock";
    let temperature = 0.3;
    if (routing.mode !== "mock") {
      const prompt = await resolveActivePrompt(input.tenantId, AGENT_ID);
      systemPrompt = prompt.systemPrompt;
      promptVersion = String(prompt.version);
      if (prompt.temperature != null) temperature = Number(prompt.temperature);
    }

    // Resolve policy BEFORE the transform — governs disposition AND carries the B2 provider
    // preference (resolved.raw.failoverOrder). The resolver fail-safes (requiresReview true; bad
    // JSON → raw null), so an absent/bad preference → today's single env-driven provider.
    const policy = await resolveAgentPolicy(input.tenantId, AGENT_ID, job.clientId);
    const failoverOrder = (policy.raw as { failoverOrder?: unknown } | null)?.failoverOrder;

    // Phase 25 feedback loop: mine this tenant's operator corrections (GOLD-first, cap 20, rejects
    // excluded) and pass them as few-shot. Tenant-scoped, consistent with the reader. Skipped on the
    // mock path. Near-empty today (sparse reviews) → the single-shot fallback inside generateInvoice.
    const fewShot =
      routing.mode === "mock" ? [] : selectFewShotPairs(await invoiceCorrectionPairs(input.tenantId));

    // LLM transform (PHRASING ONLY — the schema is number-free, D1). Provider preference +
    // failover applied inside. The invoice creator has no auto-execute path — it ALWAYS queues.
    const { object, usage, model } = await generateInvoice({
      routing,
      systemPrompt,
      vendorInvoice,
      vendorLines,
      job,
      temperature,
      failoverOrder,
      fewShot,
    });

    // JOIN the numbers in (D1) — the dollar fields come from the vendor lines (cost basis), never
    // the LLM. markup_percent is the rule's default for PREVIEW (D2). A lumped vendor invoice (or
    // one with no itemized lines) stays ONE line at the vendor TOTAL (D3 — never split).
    const markupPreview = await resolveClientMarkupDefault(input.tenantId, clientId);
    const llmByVendorLine = new Map<string, (typeof object.lineItems)[number]>();
    for (const ln of object.lineItems) {
      if (ln.reconcilesToVendorLineId) llmByVendorLine.set(ln.reconcilesToVendorLineId, ln);
    }

    // Phase (ii) Unit 2b (batch 1) — rate_sheet LABOR fork (the itemized branch only; the invoice-
    // level lump branch + materials + the vendor-cost-reference UI are batch 2). For a rate_sheet job:
    //  - an ITEMIZED labor/trip vendor line (one with a real per-unit basis — a non-empty `unit`) is
    //    re-priced to the AGREED RATE: unit_price = the resolved rate (per unit), quantity = the
    //    vendor's count, markup null (rate has margin baked in), trade_id/rate_type provenance +
    //    suggestedUnitPrice (the batch-2 editor chip). The line is DECOUPLED from vendor cost.
    //  - a LUMPED labor/trip line (no per-unit basis) OR one with no agreed rate on file is left BLANK
    //    for the operator (no guessed hours; no markup — rate_sheet labor is never marked up).
    // MATERIALS/other and cost_plus/flat are UNCHANGED (the cost-plus path below is byte-identical to
    // before). DETECTION rule: `unit` non-empty ⇒ itemized; null/empty ⇒ lumped (quantity defaults to
    // "1" and so can't distinguish a 1-hour line from a lump — `unit` is the vendor's explicit basis).
    const billingCtx = await loadJobBillingContext({ tenantId: input.tenantId, jobId: input.jobId });
    const isRateSheet = billingCtx?.billingModel === "rate_sheet";
    const agreedRateByCategory = new Map<string, string | null>();
    const agreedRateFor = async (
      category: string,
    ): Promise<{ rate: string; rateType: RateType } | null> => {
      if (!isRateSheet || !job.primaryTradeId) return null;
      const rateType = defaultRateTypeForCategory(category);
      if (!rateType) return null; // not labor/trip → judgment, never auto-priced
      if (!agreedRateByCategory.has(category)) {
        agreedRateByCategory.set(
          category,
          await resolveClientLaborRate({
            tenantId: input.tenantId,
            clientId,
            tradeId: job.primaryTradeId,
            rateType,
          }),
        );
      }
      const rate = agreedRateByCategory.get(category) ?? null;
      return rate === null ? null : { rate, rateType };
    };
    const hasUnitBasis = (unit: string | null) => unit != null && unit.trim() !== "";

    const isLump = object.lumpFlag === true || vendorLines.length === 0;
    let proposedLines: ProposedInvoiceLine[];
    if (isLump) {
      const first = object.lineItems[0];
      proposedLines = [
        {
          category: first?.category ?? "other",
          description:
            first?.description ??
            `Services per vendor invoice ${vendorInvoice.invoiceNumber ?? "(no number)"}`,
          quantity: "1",
          unit: null,
          unitPrice: vendorInvoice.total, // the WHOLE vendor amount — never split (D3)
          markupPercent: markupPreview,
          reconcilesToVendorLineId: null,
        },
      ];
    } else {
      // Vendor lines are the source of truth for numbers — every cost is represented exactly once;
      // an unmatched vendor line keeps its own description (kept whole, no invented number).
      proposedLines = await Promise.all(
        vendorLines.map(async (vl) => {
          const llm = llmByVendorLine.get(vl.id);
          const category = (llm?.category ?? vl.category) as ProposedInvoiceLine["category"];
          const description = llm?.description ?? vl.description;

          // rate_sheet LABOR/trip fork — decoupled from vendor cost.
          if (isRateSheet) {
            const agreed = await agreedRateFor(category);
            if (agreed && hasUnitBasis(vl.unit)) {
              // ITEMIZED: bill quantity × agreed rate, markup null, provenance + chip seed.
              return {
                category,
                description,
                quantity: vl.quantity,
                unit: vl.unit,
                unitPrice: agreed.rate,
                markupPercent: null,
                reconcilesToVendorLineId: vl.id,
                tradeId: job.primaryTradeId,
                rateType: agreed.rateType,
                suggestedUnitPrice: agreed.rate,
              };
            }
            if (defaultRateTypeForCategory(category)) {
              // LUMPED labor/trip (no per-unit basis) OR no agreed rate on file → BLANK for the
              // operator (no guessed hours, no markup). No provenance — it is not billing the rate.
              return {
                category,
                description,
                quantity: vl.quantity,
                unit: vl.unit,
                unitPrice: "",
                markupPercent: null,
                reconcilesToVendorLineId: vl.id,
              };
            }
          }

          // cost_plus / flat, OR a non-resolvable category (materials/etc) on rate_sheet — UNCHANGED
          // cost-plus path (byte-identical to before this batch).
          return {
            category,
            description,
            quantity: vl.quantity,
            unit: vl.unit,
            unitPrice: vl.unitPrice, // vendor cost basis — copied, never generated
            markupPercent: markupPreview,
            reconcilesToVendorLineId: vl.id,
          };
        }),
      );
    }

    const proposedInvoice: ProposedInvoice = { lineItems: proposedLines, lumpFlag: isLump };

    await logDecision(ctx, {
      decisionType: "invoice_proposal",
      proposedAction: "Draft a client-facing, marked-up invoice from the vendor invoice",
      reasoning: object.rationale,
      confidence: object.confidence,
      policyCheck: policy.requiresReview ? "requires_review" : "review_not_required",
      disposition: "queued_for_review",
      metadata: { lineCount: proposedLines.length, lumpFlag: isLump },
    });

    // write-narrow — the draft at pending_review (auto-logged). proposed_invoice is immutable.
    const writeDraft = registerTool(ctx, createInvoiceDraftTool);
    const draft = await writeDraft({
      tenantId: input.tenantId,
      jobId: input.jobId,
      agentRunId: ctx.runId,
      vendorInvoiceId: input.vendorInvoiceId,
      clientId,
      proposedInvoice,
    });

    await closeRun(ctx, {
      status: "succeeded",
      outputSummary: `Drafted ${proposedLines.length}-line client invoice (confidence ${object.confidence}${isLump ? ", lumped" : ""})`,
      model,
      promptVersion,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
    return { runId: ctx.runId, draftId: draft.id };
  } catch (err) {
    await closeRun(ctx, { status: "failed", errorMessage: (err as Error).message });
    throw err;
  }
}
