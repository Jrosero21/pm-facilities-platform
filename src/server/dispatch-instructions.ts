import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLogs, clients, tenants } from "@/server/schema";

// ── vendor-WO batch 1 — DISPATCH-INSTRUCTION TEMPLATE STORAGE ─────────────────────────
// The standing boilerplate a vendor is told every time work is dispatched. Two levels:
// per-client (clients.dispatch_instructions) and a tenant-wide default
// (tenants.default_dispatch_instructions).
//
// ★ RESOLUTION PICKS ONE, IT NEVER CONCATENATES. A client that sets its own instructions
// REPLACES the tenant default rather than appending to it. Concatenation would mean a client
// could never opt OUT of a default clause — and the clauses that go here (PO requirements,
// invoicing rules, after-hours contact) are exactly the ones a specific client contradicts.
//
// ★ THIS RETURNS THE RAW TEMPLATE. @tokens are NOT substituted here; batch 2 owns rendering.
// Keeping storage and substitution apart means the stored text stays editable and reviewable as
// what the operator typed, and a token that fails to resolve is a rendering concern rather than
// something baked into the row.
//
// ★ NO UI THIS BATCH, matching the company-profile posture: the tenant-settings surface is banked
// (CF-23.1 + CF-28.1 build together), so a one-off screen here would be the separate screen the
// bank says not to build. Both setters exist so the values are settable by script today and the
// UI can adopt them unchanged.

/**
 * "client"         — the client set its own instructions.
 * "tenant_default" — the client has none; the tenant-wide default answered.
 * "none"           — neither is set; a work order renders no instructions section.
 */
export type DispatchInstructionsSource = "client" | "tenant_default" | "none";

export type ResolvedDispatchInstructions = {
  /** The RAW template, tokens unsubstituted. null when source is "none". */
  template: string | null;
  source: DispatchInstructionsSource;
};

/** Treat whitespace-only as unset — an operator who clears a textarea leaves "" or "\n", not null. */
function usable(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The effective dispatch-instruction template for one client: client, else tenant default, else
 * none. Reports WHICH source answered so a work order can note when it is falling back — the same
 * non-silent-fallback rule getJobCoordinator follows, and for the same reason: "the client's own
 * policy" and "our generic boilerplate" are different claims to put in front of a vendor.
 *
 * Returns source "none" (not an error) for an unknown client — a caller rendering a document
 * should omit the section, not fail.
 */
export async function resolveDispatchInstructions(
  tenantId: string,
  clientId: string,
): Promise<ResolvedDispatchInstructions> {
  const [clientRows, tenantRows] = await Promise.all([
    db
      .select({ instructions: clients.dispatchInstructions })
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), eq(clients.id, clientId)))
      .limit(1),
    db
      .select({ instructions: tenants.defaultDispatchInstructions })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
  ]);

  const clientText = usable(clientRows[0]?.instructions);
  if (clientText) return { template: clientText, source: "client" };

  const tenantText = usable(tenantRows[0]?.instructions);
  if (tenantText) return { template: tenantText, source: "tenant_default" };

  return { template: null, source: "none" };
}

/**
 * Set (or clear) one client's dispatch instructions. Audited as
 * client.dispatch_instructions_updated.
 *
 * ★ THE AUDIT RECORDS THE FACT, NOT THE TEXT — same discipline as the company-profile setter.
 * These instructions are business content (contacts, PO rules, site procedure); an audit trail is
 * for who-changed-what-when, not a second copy of the content. It does record whether the value
 * was SET or CLEARED, plus lengths, which is what an investigation actually needs.
 *
 * Passing null or whitespace CLEARS the column, which makes the client fall back to the tenant
 * default — the deliberate way to opt back into the default.
 *
 * Authz is enforced at the action layer (tenant-wide/client config), mirroring
 * setClientBillingModel and setTenantCompanyProfile.
 *
 * Throws: CLIENT_NOT_FOUND.
 */
export async function setClientDispatchInstructions(input: {
  tenantId: string;
  clientId: string;
  instructions: string | null;
  actorUserId: string | null;
}): Promise<void> {
  const next = usable(input.instructions);
  await db.transaction(async (tx) => {
    const cur = (
      await tx
        .select({ instructions: clients.dispatchInstructions })
        .from(clients)
        .where(and(eq(clients.tenantId, input.tenantId), eq(clients.id, input.clientId)))
        .for("update")
    )[0];
    if (!cur) throw new Error("CLIENT_NOT_FOUND");

    const prev = usable(cur.instructions);
    if (prev === next) return; // no-op — no write, no audit (mirrors setClientBillingModel)

    await tx
      .update(clients)
      .set({ dispatchInstructions: next })
      .where(and(eq(clients.tenantId, input.tenantId), eq(clients.id, input.clientId)));

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "client.dispatch_instructions_updated",
      targetType: "client",
      targetId: input.clientId,
      metadata: {
        change: next === null ? "cleared" : prev === null ? "set" : "replaced",
        previousLength: prev?.length ?? 0,
        newLength: next?.length ?? 0,
      },
    });
  });
}

/**
 * Set (or clear) the tenant-wide default dispatch instructions. Audited as
 * tenant.default_dispatch_instructions_updated. Same fact-not-text audit rule as above.
 *
 * Clearing this leaves every client without its own instructions rendering no section at all, so
 * it is a broader change than it looks — the audit records it as "cleared" for exactly that reason.
 *
 * Throws: TENANT_NOT_FOUND.
 */
export async function setTenantDefaultDispatchInstructions(input: {
  tenantId: string;
  instructions: string | null;
  actorUserId: string | null;
}): Promise<void> {
  const next = usable(input.instructions);
  await db.transaction(async (tx) => {
    const cur = (
      await tx
        .select({ instructions: tenants.defaultDispatchInstructions })
        .from(tenants)
        .where(eq(tenants.id, input.tenantId))
        .for("update")
    )[0];
    if (!cur) throw new Error("TENANT_NOT_FOUND");

    const prev = usable(cur.instructions);
    if (prev === next) return; // no-op — no write, no audit

    await tx
      .update(tenants)
      .set({ defaultDispatchInstructions: next })
      .where(eq(tenants.id, input.tenantId));

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "tenant.default_dispatch_instructions_updated",
      targetType: "tenant",
      targetId: input.tenantId,
      metadata: {
        change: next === null ? "cleared" : prev === null ? "set" : "replaced",
        previousLength: prev?.length ?? 0,
        newLength: next?.length ?? 0,
      },
    });
  });
}
