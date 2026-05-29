// ── Phase 9 batch 9e — EmptyState (shared UI primitive) ────────────────────────────────
// The project's first shared empty-state primitive (9e manifest §7). Matches the established ad-hoc
// markup verbatim — Phase 8 rendered empty sections as a muted paragraph inline
// (`<p className="text-sm text-neutral-600">No X yet.</p>`); this consolidates that idiom so the 9e
// dashboard's ~9 panels share one component. Caller supplies surrounding margin via `className` (e.g.
// "mt-3") to fit its section, consistent with the prior inline usage. Server-compatible (no client
// directive). Inheritable by Phase 10/11 portals (which may add richer portal-specific empty states).

export function EmptyState({ message, className }: { message: string; className?: string }) {
  return (
    <p className={`text-sm text-neutral-600${className ? ` ${className}` : ""}`}>{message}</p>
  );
}
