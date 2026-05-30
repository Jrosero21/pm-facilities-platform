// ── Phase 10 batch 10k-ui — /vendor/jobs/[id] route-level loading skeleton ─────────────
// Route-level Suspense fallback mirroring dashboard/loading.tsx (Phase 9 9e).

export default function VendorAssignmentDetailLoading() {
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-neutral-200" />
        <div className="h-8 w-64 animate-pulse rounded bg-neutral-200" />
        <div className="h-4 w-96 animate-pulse rounded bg-neutral-200" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-20 animate-pulse rounded bg-neutral-200" />
        <div className="h-10 w-40 animate-pulse rounded bg-neutral-200" />
      </div>
    </section>
  );
}
