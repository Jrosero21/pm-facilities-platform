// ── Phase 11 batch 11d — /client/jobs route-level loading skeleton ─────────────────────
// Mirrors (vendor)/vendor/jobs/loading.tsx (Phase 10 10i).

export default function ClientJobsLoading() {
  return (
    <section>
      <div className="h-7 w-40 animate-pulse rounded bg-neutral-200" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-neutral-200" />
      <div className="mt-8 h-32 animate-pulse rounded-lg border border-neutral-200 bg-white" />
    </section>
  );
}
