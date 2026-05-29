// ── Phase 9 batch 9e — dashboard color encoding (pure constants) ───────────────────────
// Single source of truth for the dashboard's color mapping (9e manifest §4). Reuses the EXISTING
// project palette (dispatch-status-badge.tsx / confidence-badge.tsx) — "do not vary per page" is a hard
// constraint, so these maps are the ONLY place 9e assigns colors. PURE constants + tiny class helpers;
// no DB, no IO, no "server-only".
//
// Color is reserved for (a) the operational queue's urgency tier and (b) status-card categories.
// Priority cards are intentionally UNCOLORED (count + rank position only) — manifest §4.

import type { UrgencyTier } from "@/server/analytics/stalled-rules";

const FALLBACK_BADGE = "bg-neutral-100 text-neutral-700";

/** Urgency-tier → badge classes (manifest §4). Keyed by the full UrgencyTier union, so adding a tier to
 *  stalled-rules forces a compile error here until its color is assigned. */
export const URGENCY_TIER_BADGE: Record<UrgencyTier, string> = {
  stalled: "bg-red-100 text-red-700",
  overdue: "bg-amber-100 text-amber-800",
  "unassigned-high-priority": "bg-amber-100 text-amber-800",
  aged: "bg-neutral-100 text-neutral-700",
};

/** Status-category → accent classes (manifest §4; categories from job_statuses.category). Terminal
 *  categories included for completeness/reuse, though the open status cards show only non-terminal ones. */
export const STATUS_CATEGORY_BADGE: Record<string, string> = {
  open: "bg-neutral-100 text-neutral-700",
  in_progress: "bg-blue-100 text-blue-800",
  on_hold: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
};

/** Badge classes for an urgency tier (falls back to neutral for an unknown tier). */
export function tierBadge(tier: string): string {
  return URGENCY_TIER_BADGE[tier as UrgencyTier] ?? FALLBACK_BADGE;
}

/** Badge classes for a status category (falls back to neutral for an unknown category). */
export function statusCategoryBadge(category: string): string {
  return STATUS_CATEGORY_BADGE[category] ?? FALLBACK_BADGE;
}
