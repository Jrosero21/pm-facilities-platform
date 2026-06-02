import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { communicationLogs, magicLinkTokens, outboundMessages } from "@/server/schema";
import { getAssignmentDetail } from "@/server/dispatch";
import { getVendorContact } from "@/server/vendor-contacts";
import { mintToken } from "@/server/magic-links/token-core";
import { sendCommunication } from "@/server/communications";

// ── Phase 21 — OPERATOR LINK DELIVERY (mint → compose → send) ─────────────────────────
// Emails a single-assignment magic link to the assignment's vendor contact. ORDER MATTERS:
// resolve the recipient email FIRST — if absent, fail and mint NOTHING (no orphan token). Mint
// a FRESH token per send (single-dispatch); on a successful send set magic_link_tokens.sent_at
// (the link-level idempotency guard, atop sendCommunication's own provider_message_id guard).
// The raw token flows mint → link body only; it is never returned to the operator UI, never logged.

/** Base URL of the app for building absolute links. Deploy-time var (new); localhost fallback. */
function appBaseUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function excerpt(s: string, max = 200): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export type SendLinkResult = { tokenId: string; deliveryStatus: string };

export async function sendAssignmentLink(input: {
  tenantId: string;
  assignmentId: string;
  actorUserId: string;
}): Promise<SendLinkResult> {
  const assignment = await getAssignmentDetail(input.tenantId, input.assignmentId);
  if (!assignment) throw new Error("ASSIGNMENT_NOT_FOUND");

  // Recipient FIRST — no deliverable email → no token is minted.
  if (!assignment.vendorContactId) throw new Error("MISSING_RECIPIENT");
  const contact = await getVendorContact(input.tenantId, assignment.vendorContactId);
  const recipientEmail = contact?.email ?? null;
  if (!recipientEmail) throw new Error("MISSING_RECIPIENT");

  // Mint a fresh token; rawToken goes straight into the link body, never persisted/logged.
  const { tokenId, rawToken } = await mintToken({
    tenantId: input.tenantId,
    assignmentId: input.assignmentId,
    expiresInSeconds: 604800, // 7 days (MVP window; manifest may make configurable)
    createdByUserId: input.actorUserId,
  });
  const link = `${appBaseUrl()}/link/${rawToken}`;
  const body =
    `You have a work order update to action.\n\n` +
    `Open your assignment (no account needed): ${link}\n\n` +
    `This link is for you only and expires in 7 days.`;

  // Compose the outbound_message + communication_logs pair inline (no helper exists).
  const omId = uuidv7();
  await db.insert(outboundMessages).values({
    id: omId,
    tenantId: input.tenantId,
    subject: "Your work order link",
    body,
    createdByUserId: input.actorUserId,
  });

  const clId = uuidv7();
  await db.insert(communicationLogs).values({
    id: clId,
    tenantId: input.tenantId,
    jobId: assignment.jobId,
    channel: "email",
    direction: "outbound",
    sourceType: "outbound_message",
    sourceId: omId,
    summary: excerpt("Vendor magic-link sent to " + recipientEmail),
    recipientType: "vendor_contact",
    recipientEmail,
    deliveryStatus: "draft",
  });

  const result = await sendCommunication({
    tenantId: input.tenantId,
    commId: clId,
    actorUserId: input.actorUserId,
  });

  // Link-level idempotency: mark the token's link as dispatched only on a successful send.
  if (result.deliveryStatus === "sent") {
    await db
      .update(magicLinkTokens)
      .set({ sentAt: sql`now()` })
      .where(and(eq(magicLinkTokens.id, tokenId), isNull(magicLinkTokens.sentAt)));
  }

  return { tokenId, deliveryStatus: result.deliveryStatus };
}
