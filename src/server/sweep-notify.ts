import "server-only";

import { and, eq, gte } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { auditLogs, outboundMessages, tenants } from "@/server/schema";
import { getSendProvider } from "@/lib/integrations/send";
import { listInternalRecipientsByRole } from "@/server/internal-recipients";
import { writeAuditLog } from "@/server/audit";
import {
  buildSweepNotification,
  sweepIsWorthNotifying,
  sweepNotificationBucketStart,
  sweepNotificationKey,
  type SweepCounts,
} from "@/server/sweep-notify-content";

// ── G3 — INTERNAL EMAIL: the unattended sweep tells somebody what it did ───────────────
// recipient_type has carried 'internal' since Phase 1 with zero usages — no staff member has ever
// been notified of anything. The sharpest instance of that gap is the auto-redispatch sweep: it is
// the ONE place the platform acts with no operator present, and heldForReview > 0 literally means
// "the machine stopped and wants a human" with no way for the human to find out.
//
// ★ OPTION (c) — A SYSTEM NOTIFICATION, NOT A PER-JOB COMMUNICATION.
// sendCommunication cannot be reused here, and the reason is structural rather than stylistic: it
// takes a commId, loads that communication_logs row, and resolves the body from the row's source.
// communication_logs.job_id is NOT NULL — the same constraint that made G2 job-scoped — but a sweep
// digest spans MANY jobs and belongs to none of them. Forcing it onto the spine would mean either
// inventing a representative job (a lie) or emitting one row per job (many emails, or many rows for
// one email). So this composes the content and calls the provider seam DIRECTLY.
//
// Nothing vanishes as a result. The two halves are recorded in the two tables that are already
// tenant-scoped rather than job-scoped:
//   CONTENT  → outbound_messages (has tenant_id, subject, body, and NO job_id — it was already the
//              job-agnostic content table; dispatch-notify and invoice-notify both use it, they
//              just additionally point a spine row at it)
//   DELIVERY → audit_logs (sweep.notification_sent / _skipped), which is also where the
//              idempotency guard reads from.
//
// The provider's SendRequest.commId is documented as "the idempotency key (= communication_logs.id)"
// — the equality is how every caller so far has used it, not a requirement of the type. Here it
// carries the sweep key instead, which is exactly what the field is for.

export type SweepNotifyResult = {
  notified: boolean;
  reason?: "no_activity" | "no_recipients" | "already_sent" | "send_failed";
  recipientCount?: number;
  outboundMessageId?: string;
};

const AUDIT_SENT = "sweep.notification_sent";
const AUDIT_SKIPPED = "sweep.notification_skipped";
const ADMIN_ROLE = "tenant_admin";

/**
 * Notify the tenant's admins about a completed auto-redispatch sweep.
 *
 * Warn-not-block throughout: this runs AFTER the sweep has already done its work, so nothing here
 * can undo or invalidate it. Every early return is a recorded fact, not an exception.
 *
 * @param at the sweep's startedAt — the idempotency bucket is derived from it, so a retry that
 *           re-runs the same sweep window is recognised as a duplicate.
 */
export async function notifyInternalOfSweep(input: {
  tenantId: string;
  counts: SweepCounts;
  at: Date;
}): Promise<SweepNotifyResult> {
  // ── Gate 1: is this news at all? A quiet run sends nothing and records nothing. ──
  if (!sweepIsWorthNotifying(input.counts)) {
    return { notified: false, reason: "no_activity" };
  }

  const key = sweepNotificationKey(input.tenantId, input.at);

  // ── Gate 2: IDEMPOTENCY. The cron can double-fire; the audit trail is the guard. ──
  // Looking for our own prior send inside this hour bucket means the guard does not depend on the
  // provider honouring an idempotency key (the CaptureProvider does not honour one at all).
  const bucketStart = sweepNotificationBucketStart(input.at);
  const prior = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.tenantId, input.tenantId),
        eq(auditLogs.action, AUDIT_SENT),
        eq(auditLogs.targetId, key),
        gte(auditLogs.createdAt, bucketStart),
      ),
    )
    .limit(1);
  if (prior[0]) {
    return { notified: false, reason: "already_sent" };
  }

  // ── Gate 3: is there anybody to tell? ──
  const recipients = await listInternalRecipientsByRole(input.tenantId, ADMIN_ROLE);
  if (recipients.length === 0) {
    await writeAuditLog({
      tenantId: input.tenantId,
      actorLabel: "system",
      action: AUDIT_SKIPPED,
      targetType: "tenant",
      targetId: key,
      metadata: { reason: "no_recipients", role: ADMIN_ROLE, counts: input.counts },
    });
    return { notified: false, reason: "no_recipients" };
  }

  const tenantRow = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, input.tenantId))
    .limit(1);
  const tenantName = tenantRow[0]?.name ?? "your account";

  const { subject, body } = buildSweepNotification({ counts: input.counts, tenantName });

  // CONTENT record. outbound_messages is tenant-scoped with no job_id, so the digest has a durable
  // home without pretending to belong to a job. created_by_user_id is null — nobody authored this.
  const outboundMessageId = uuidv7();
  await db.insert(outboundMessages).values({
    id: outboundMessageId,
    tenantId: input.tenantId,
    subject,
    body,
    createdByUserId: null,
  });

  // One send per recipient. The provider key is suffixed per user so two admins each get their
  // copy while a re-run of the same bucket collides on the same keys.
  const provider = getSendProvider();
  const failures: string[] = [];
  for (const r of recipients) {
    const result = await provider.send({
      to: r.email,
      subject,
      body,
      commId: `${key}:${r.userId}`,
    });
    if (result.status !== "sent") failures.push(result.error);
  }

  const sentCount = recipients.length - failures.length;

  // DELIVERY record. Written even on total failure, so a silent night is distinguishable from a
  // broken sender. targetId is the idempotency key — which is what Gate 2 reads back.
  await writeAuditLog({
    tenantId: input.tenantId,
    actorLabel: "system",
    action: sentCount > 0 ? AUDIT_SENT : AUDIT_SKIPPED,
    targetType: "tenant",
    targetId: key,
    metadata: {
      // Counts and roles only — no job numbers, no client names, no addresses.
      recipientCount: recipients.length,
      sentCount,
      failedCount: failures.length,
      role: ADMIN_ROLE,
      provider: provider.name,
      outboundMessageId,
      counts: input.counts,
      ...(failures.length > 0 ? { errors: failures.slice(0, 3) } : {}),
      ...(sentCount === 0 ? { reason: "send_failed" } : {}),
    },
  });

  if (sentCount === 0) {
    return { notified: false, reason: "send_failed", recipientCount: recipients.length, outboundMessageId };
  }
  return { notified: true, recipientCount: recipients.length, outboundMessageId };
}
