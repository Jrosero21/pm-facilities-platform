// ── Phase 11 batch 11e — /client/jobs/[id] route-level loading skeleton ────────────────
// Mirrors (vendor)/vendor/jobs/[id]/loading.tsx (Phase 10 10k-ui).

export default function ClientJobDetailLoading() {
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-neutral-200" />
        <div className="h-8 w-64 animate-pulse rounded bg-neutral-200" />
        <div className="h-4 w-48 animate-pulse rounded bg-neutral-200" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-28 animate-pulse rounded bg-neutral-200" />
        <div className="h-20 animate-pulse rounded-lg bg-neutral-100" />
      </div>
    </section>
  );
}
