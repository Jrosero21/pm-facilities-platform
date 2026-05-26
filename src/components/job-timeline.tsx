"use client";

import { useState } from "react";
import type { TimelineRow } from "@/lib/timeline";
import { DeliveryStatusBadge } from "@/components/delivery-status-badge";
import { NoteVisibilityBadge } from "@/components/note-visibility-badge";

// --- native relative time (no date-fns; Intl.RelativeTimeFormat) ---
const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function relativeTime(d: Date): string {
  const sec = Math.round((d.getTime() - Date.now()) / 1000);
  const a = Math.abs(sec);
  if (a < 60) return RTF.format(sec, "second");
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return RTF.format(min, "minute");
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return RTF.format(hr, "hour");
  const day = Math.round(hr / 24);
  if (Math.abs(day) < 30) return RTF.format(day, "day");
  const mon = Math.round(day / 30);
  if (Math.abs(mon) < 12) return RTF.format(mon, "month");
  return RTF.format(Math.round(mon / 12), "year");
}

function dayLabel(d: Date): string {
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// --- inline SVG icons (no icon library — project's no-UI-deps posture, R-6.x) ---
const iconCls = "h-4 w-4";
const Created = () => (
  <svg viewBox="0 0 16 16" className={iconCls} fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="4" />
  </svg>
);
const Dispatched = () => (
  <svg viewBox="0 0 16 16" className={iconCls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8h9m-3-3 3 3-3 3" />
  </svg>
);
const Dot = () => (
  <svg viewBox="0 0 16 16" className={iconCls} fill="currentColor">
    <circle cx="8" cy="8" r="3" />
  </svg>
);
const Outbound = () => (
  <svg viewBox="0 0 16 16" className={iconCls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 11 11 5m-4 0h4v4" />
  </svg>
);
const Inbound = () => (
  <svg viewBox="0 0 16 16" className={iconCls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 5 11m4 0H5V7" />
  </svg>
);
const Note = () => (
  <svg viewBox="0 0 16 16" className={iconCls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2h5l3 3v9H4z" />
    <path d="M6.5 7.5h3M6.5 10h3" />
  </svg>
);

function rowIcon(row: TimelineRow) {
  if (row.kind === "communication") return row.direction === "inbound" ? <Inbound /> : <Outbound />;
  if (row.kind === "note") return <Note />;
  if (row.eventType === "job.created") return <Created />;
  if (row.eventType === "job.dispatched") return <Dispatched />;
  return <Dot />;
}

// Display text + actor differ by kind; notes have no `summary`/`sentByName`.
function rowText(row: TimelineRow): string {
  return row.kind === "note" ? row.bodyExcerpt : row.summary;
}
function rowActor(row: TimelineRow): string {
  if (row.kind === "event") return row.actorName ?? "System";
  if (row.kind === "communication") return row.sentByName ?? "System";
  return row.authorName ?? "System";
}

type FilterMode = "all" | "milestones" | "communications" | "notes";
const FILTERS: { mode: FilterMode; label: string }[] = [
  { mode: "all", label: "All" },
  { mode: "milestones", label: "Milestones" },
  { mode: "communications", label: "Communications" },
  { mode: "notes", label: "Notes" },
];

// Category accent + icon color — a CATEGORY axis (source-kind), intentionally NOT the
// status/visibility/delivery palettes (R-6.x): slate = milestone, indigo = communication,
// rose = note (a warm third hue, distinct from both cool accents and from every semantic
// badge palette, so the three categories stay legible without conflating axes).
function accent(row: TimelineRow): string {
  switch (row.kind) {
    case "event":
      return "border-l-slate-400 text-slate-500";
    case "communication":
      return "border-l-indigo-400 text-indigo-500";
    case "note":
      return "border-l-rose-400 text-rose-500";
  }
}

export function JobTimeline({ rows }: { rows: TimelineRow[] }) {
  const [mode, setMode] = useState<FilterMode>("all");
  const filtered = rows.filter((r) => {
    switch (mode) {
      case "all":
        return true;
      case "milestones":
        return r.kind === "event";
      case "communications":
        return r.kind === "communication";
      case "notes":
        return r.kind === "note";
    }
  });

  // Group by day (rows are already sorted oldest-first, so groups stay chronological).
  const groups: { key: string; day: Date; rows: TimelineRow[] }[] = [];
  for (const r of filtered) {
    const key = r.createdAt.toDateString();
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, day: r.createdAt, rows: [] };
      groups.push(g);
    }
    g.rows.push(r);
  }

  return (
    <div>
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.mode}
            type="button"
            onClick={() => setMode(f.mode)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              mode === f.mode
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-600">Nothing to show for this filter.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {groups.map((g) => (
            <div key={g.key}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400" suppressHydrationWarning>
                {dayLabel(g.day)}
              </h3>
              <ul className="mt-2 space-y-2">
                {g.rows.map((row) => (
                  <li key={`${row.kind}-${row.id}`} className={`flex gap-2 border-l-2 pl-3 ${accent(row)}`}>
                    <span className="mt-0.5 shrink-0">{rowIcon(row)}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">{rowText(row)}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
                        <span>{rowActor(row)}</span>
                        <span>·</span>
                        <span title={row.createdAt.toLocaleString()} suppressHydrationWarning>
                          {relativeTime(row.createdAt)}
                        </span>
                        {row.kind === "communication" && (
                          <>
                            <DeliveryStatusBadge status={row.deliveryStatus} />
                            <NoteVisibilityBadge visibility={row.visibility} />
                          </>
                        )}
                        {row.kind === "note" && <NoteVisibilityBadge visibility={row.visibility} />}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
