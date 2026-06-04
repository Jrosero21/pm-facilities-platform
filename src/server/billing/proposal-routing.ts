import Big from "big.js";

// ── Phase 27 batch 5a — PROPOSAL NTE ROUTING DECISION (pure) ──────────────────────────
// PURE — NO "server-only", NO DB, NO IO. The SINGLE source of the proposal kind decision so the
// publish path (publishProposalDraft) and the read-only routing PREVIEW (previewProposalRoutingAction)
// can NEVER disagree. Decimal-string comparison via Big.js — NO float.
//
//   forceClientReview === true → "client"   (override forces TOWARD review, §2.1-safe)
//   effectiveNte === null      → "client"   (no ceiling → fail-safe to the client review flow)
//   Big(total).lte(Big(nte))   → "internal" (at or under the NTE → auto-billed internal)
//   else                       → "client"   (over the NTE → client review)
export function decideProposalKind(
  total: string,
  effectiveNte: string | null,
  forceClientReview: boolean,
): "client" | "internal" {
  if (forceClientReview) return "client";
  if (effectiveNte === null) return "client";
  return new Big(total).lte(new Big(effectiveNte)) ? "internal" : "client";
}
