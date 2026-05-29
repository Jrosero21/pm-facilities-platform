// ── Phase 9 batch 9e — /dashboard route-level loading UI (manifest §8) ─────────────────
// Route-level Suspense fallback (Next wraps the async dashboard page automatically). A minimal skeleton
// reusing the card idiom — a basic navigation affordance, NOT per-panel streaming (manifest §8 option
// (b); the 9c readers are millisecond-cheap at current/foreseeable volume, so per-panel Suspense is
// unearned complexity). Future-scale watchpoint: refine to option (c) when reader latency warrants it.

export default function DashboardLoading() {
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
      <p className="mt-8 text-sm text-neutral-600">Loading dashboard…</p>
    </div>
  );
}
