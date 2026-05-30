// ── Phase 10 batch 10i — /vendor/jobs route-level loading skeleton ─────────────────────
// Route-level Suspense fallback mirroring dashboard/loading.tsx (Phase 9 9e). Minimal skeleton —
// the readers (when 10j lands them) are millisecond-cheap, so per-row streaming is unearned.

export default function VendorJobsLoading() {
  return (
    <section>
      <div className="h-7 w-40 animate-pulse rounded bg-neutral-200" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-neutral-200" />
      <div className="mt-8 h-32 animate-pulse rounded-lg border border-neutral-200 bg-white" />
    </section>
  );
}
