// PURE shared module — NO "server-only", NO "use client", NO DB/env/IO. The follow-up category
// vocabulary + friendly labels, shared by the server (jobs.ts writer, actions validation) and the
// client (the edit form select, the detail label). MUST match the pgEnum on jobs.follow_up_category
// (schema + migration 0053). Single source of truth so the four sites can't drift.

export const FOLLOW_UP_CATEGORIES = [
  "vendor_followup",
  "confirm_onsite",
  "proposal_followup",
  "general",
] as const;

export type FollowUpCategory = (typeof FOLLOW_UP_CATEGORIES)[number];

export const FOLLOW_UP_CATEGORY_LABELS: Record<FollowUpCategory, string> = {
  vendor_followup: "Vendor follow-up",
  confirm_onsite: "Confirm on-site",
  proposal_followup: "Proposal follow-up",
  general: "General reminder",
};

/** Runtime narrowing guard — a posted string is one of the four categories. */
export function isFollowUpCategory(value: string): value is FollowUpCategory {
  return (FOLLOW_UP_CATEGORIES as readonly string[]).includes(value);
}
