import type { JobEventListItem } from "@/server/job-events";
import type { CommunicationListItem } from "@/server/communications";

// A merged timeline row, discriminated by `kind`. The rich timeline (6c) interleaves
// job_events (milestones) and communication_logs (communications) into one chronological
// narrative — the workspace-vs-narrative two-view model (R-6.x): the same data renders
// here read-only (narration) and in the Communications/Dispatch sections (workspace).
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
    };

// Milestones (events) sort before communications on a same-instant tie.
const sourceRank = (r: TimelineRow): number => (r.kind === "event" ? 0 : 1);

/**
 * Merge job events + communications into one chronological timeline. Pure (no DB).
 * Sorted (created_at ASC, sourceRank ASC): oldest-first, and on a same-instant tie the
 * MILESTONE (event, rank 0) sorts before the COMMUNICATION (rank 1) — the milestone is
 * the headline of that moment (R-6.x tie-break). Input order is irrelevant (re-sorted).
 */
export function mergeTimeline(
  events: JobEventListItem[],
  communications: CommunicationListItem[],
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
  ];
  return rows.sort((a, b) => {
    const t = a.createdAt.getTime() - b.createdAt.getTime();
    return t !== 0 ? t : sourceRank(a) - sourceRank(b);
  });
}
