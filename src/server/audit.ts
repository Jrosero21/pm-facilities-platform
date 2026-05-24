import "server-only";

import { db } from "@/server/db";
import { auditLogs } from "@/server/schema";

export type WriteAuditLogInput = {
  tenantId?: string | null;
  userId?: string | null;
  actorLabel?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Append a row to audit_logs. Auditing must never break the main flow, so
 * failures are logged and swallowed rather than thrown.
 */
export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      actorLabel: input.actorLabel ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (err) {
    console.error(`[audit] failed to write "${input.action}":`, err);
  }
}
