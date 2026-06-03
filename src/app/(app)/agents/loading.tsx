// ── Phase 24 track A — /agents route-level loading UI ──────────────────────────────────
// Route-level Suspense fallback (Next wraps the async page automatically). Minimal skeleton
// reusing the card idiom — a navigation affordance, NOT per-panel streaming (the observability
// readers are millisecond-cheap at current volume). Mirrors dashboard/loading.tsx.

export default function AgentsLoading() {
  return (
    <div>
      <div className="h-7 w-40 animate-pulse rounded bg-neutral-200" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["s1", "s2", "s3", "s4", "s5", "s6"].map((k) => (
          <div
            key={k}
            className="h-24 animate-pulse rounded-lg border border-neutral-200 bg-white"
          />
        ))}
      </div>
      <p className="mt-8 text-sm text-neutral-600">Loading AI Agents…</p>
    </div>
  );
}
