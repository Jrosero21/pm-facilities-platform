import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { tenants } from "@/server/schema";
import { getJobDetail } from "@/server/jobs";
import { getLocation } from "@/server/client-locations";
import { getJobCoordinator } from "@/server/job-coordinator";
import { resolveDispatchInstructions } from "@/server/dispatch-instructions";
import {
  renderDispatchTemplate,
  siteAddressLine,
  type DispatchTemplateContext,
  type RenderedDispatchTemplate,
} from "@/server/dispatch-template";
import type { DispatchInstructionsSource } from "@/server/dispatch-instructions";

// ── vendor-WO batch 2 — CONTEXT ASSEMBLY (the DB half) ────────────────────────────────
// Gathers everything the pure token registry can draw on. All IO lives here; all rules live in
// dispatch-template.ts. That split is what makes the substitution unit-testable without a database
// — the same shape G1's invoice-notify-content and G2's contact-log-content follow.
//
// Sources are the ones dispatch-notify already uses, deliberately: getJobDetail for the job facts
// and the same approvedScopeOfWork ?? scopeOfWork fallback createDispatch applies (dispatch.ts:266),
// so a token renders the SAME scope the vendor is actually dispatched against. A second, divergent
// scope resolution is exactly the kind of drift the shared-formatters work existed to remove.
//
// ★ {coordinatorPhone} COMES FROM tenants.phone. users has no phone column, so there is no
// per-person number to resolve — this is the company's main line, identical for every coordinator.
// Batch 0 kept that provenance explicit rather than inventing users.phone, and this preserves it.

/** Assembled facts plus the provenance a caller may want to surface. */
export type AssembledDispatchContext = {
  context: DispatchTemplateContext;
  /** Which template answered: the client's own, the tenant default, or nothing. */
  instructionsSource: DispatchInstructionsSource;
  /** The raw template, tokens unsubstituted. null when no template is configured. */
  rawTemplate: string | null;
  /** "assigned" when the job carries a real coordinator, "creator" when it fell back. */
  coordinatorSource: "assigned" | "creator" | null;
};

/**
 * Assemble the token context for one job.
 *
 * Returns null only when the job does not exist in this tenant. Everything else degrades to a null
 * field: a job with no location, no trade, no coordinator or no template still assembles, and the
 * renderer omits what it cannot fill.
 */
export async function assembleDispatchContext(
  tenantId: string,
  jobId: string,
): Promise<AssembledDispatchContext | null> {
  const job = await getJobDetail(tenantId, jobId);
  if (!job) return null;

  const [location, coordinator, tenantRows, instructions] = await Promise.all([
    job.clientLocationId ? getLocation(tenantId, job.clientLocationId) : Promise.resolve(null),
    getJobCoordinator(tenantId, jobId),
    db.select({ phone: tenants.phone }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
    resolveDispatchInstructions(tenantId, job.clientId),
  ]);

  const context: DispatchTemplateContext = {
    jobNumber: job.jobNumber ?? null,
    clientName: job.clientName ?? null,
    siteName: job.locationName ?? null,
    siteAddress: location ? siteAddressLine(location) : null,
    tradeName: job.tradeName ?? null,
    priorityName: job.priorityName ?? null,
    // The SAME fallback order createDispatch uses, so the token and the dispatch agree.
    scope: job.approvedScopeOfWork ?? job.scopeOfWork ?? null,
    notToExceedAmount: job.notToExceedAmount ?? null,
    coordinatorName: coordinator?.name ?? null,
    coordinatorEmail: coordinator?.email ?? null,
    coordinatorPhone: tenantRows[0]?.phone ?? null,
  };

  return {
    context,
    instructionsSource: instructions.source,
    rawTemplate: instructions.template,
    coordinatorSource: coordinator?.source ?? null,
  };
}

export type RenderedDispatchInstructions = RenderedDispatchTemplate & {
  instructionsSource: DispatchInstructionsSource;
  coordinatorSource: "assigned" | "creator" | null;
};

/**
 * The end-to-end convenience: resolve this job's template and substitute its tokens.
 *
 * Returns null for an unknown job. A job with no configured template returns an empty `text` with
 * source "none" — a caller renders no instructions section rather than treating it as an error.
 */
export async function renderDispatchInstructionsForJob(
  tenantId: string,
  jobId: string,
): Promise<RenderedDispatchInstructions | null> {
  const assembled = await assembleDispatchContext(tenantId, jobId);
  if (!assembled) return null;
  const rendered = renderDispatchTemplate(assembled.rawTemplate, assembled.context);
  return {
    ...rendered,
    instructionsSource: assembled.instructionsSource,
    coordinatorSource: assembled.coordinatorSource,
  };
}
