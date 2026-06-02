import "server-only";

// ── Phase 21 — VENDOR ACTOR (registered user OR linkless magic-link token) ─────────────
// The single actor shape every vendor write fn takes, replacing the prior `actorUserId:
// string`. A registered vendor (logged in, has a users row + vendor_users mapping) is
// { kind:"user" }; a no-account vendor acting through a magic link is { kind:"linkless" },
// attributed to the token (no users row). Author columns become NULL for linkless; notes +
// photos additionally carry source_token_id provenance so the token surface can scope reads
// by assignment without an author (Phase-20 cross-vendor isolation preserved). Audit:
// kind:"user" → { userId }, via "vendor_portal"; kind:"linkless" → { userId:null,
// actorLabel:"linkless-vendor", metadata.tokenId }, via "magic_link".
export type VendorActor =
  | { kind: "user"; userId: string }
  | { kind: "linkless"; tokenId: string };

/** The audit actor-label for a linkless (no-account) vendor action. */
export const LINKLESS_ACTOR_LABEL = "linkless-vendor";
