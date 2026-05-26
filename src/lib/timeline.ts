import type { JobEventListItem } from "@/server/job-events";
import type { CommunicationListItem } from "@/server/communications";
import type { JobNoteListItem } from "@/server/job-notes";

// A merged timeline row, discriminated by `kind`. The rich timeline (6c) interleaves
// job_events (milestones), communication_logs (communications), and a curated slice of
// job_notes (6c.1) into one chronological narrative — the workspace-vs-narrative two-view
// model (R-6.x): the same data renders here read-only (narration) and in the
// Notes/Communications/Dispatch sections (workspace).
//
// Which notes reach this timeline is decided by the CALLER, not here (page-side filter,
// 6c.1): a note appears iff (visibility ≠ internal_only) AND (not yet shared as a
// communication). internal_only stays workspace-only; a shared note is represented by its
// communication, not duplicated as a note. See the job detail page for the filter.
export type TimelineRow =
  | {
      kind: "event";
      id: string;
      createdAt: Date;
      eventType: string;
      summary: string;
      actorName: string | null;
    }
  | {
      kind: "communication";
      id: string;
      createdAt: Date;
      channel: string;
      direction: string;
      visibility: string;
      summary: string;
      deliveryStatus: string;
      sourceType: string;
      recipientEmail: string | null;
      sentByName: string | null;
    }
  | {
      kind: "note";
      id: string;
      createdAt: Date;
      visibility: string;
      bodyExcerpt: string;
      authorName: string | null;
    };

// Same-instant tie-break: MILESTONE (0) before COMMUNICATION (1) before NOTE (2).
const sourceRank = (r: TimelineRow): number =>
  r.kind === "event" ? 0 : r.kind === "communication" ? 1 : 2;

function excerpt(s: string, max = 200): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Merge job events + communications + (pre-filtered) notes into one chronological
 * timeline. Pure (no DB). Sorted (created_at ASC, sourceRank ASC): oldest-first, and on a
 * same-instant tie the MILESTONE sorts before the COMMUNICATION before the NOTE — the
 * milestone is the headline of that moment (R-6.x tie-break). Input order is irrelevant
 * (re-sorted). `notes` must already be filtered by the caller (6c.1 visibility rule).
 */
export function mergeTimeline(
  events: JobEventListItem[],
  communications: CommunicationListItem[],
  notes: JobNoteListItem[] = [],
): TimelineRow[] {
  const rows: TimelineRow[] = [
    ...events.map(
      (e): TimelineRow => ({
        kind: "event",
        id: e.id,
        createdAt: e.createdAt,
        eventType: e.eventType,
        summary: e.summary,
        actorName: e.actorName,
      }),
    ),
    ...communications.map(
      (c): TimelineRow => ({
        kind: "communication",
        id: c.id,
        createdAt: c.createdAt,
        channel: c.channel,
        direction: c.direction,
        visibility: c.visibility,
        summary: c.summary,
        deliveryStatus: c.deliveryStatus,
        sourceType: c.sourceType,
        recipientEmail: c.recipientEmail,
        sentByName: c.sentByName,
      }),
    ),
    ...notes.map(
      (n): TimelineRow => ({
        kind: "note",
        id: n.id,
        createdAt: n.createdAt,
        visibility: n.visibility,
        bodyExcerpt: excerpt(n.body),
        authorName: n.authorName,
      }),
    ),
  ];
  return rows.sort((a, b) => {
    const t = a.createdAt.getTime() - b.createdAt.getTime();
    return t !== 0 ? t : sourceRank(a) - sourceRank(b);
  });
}
