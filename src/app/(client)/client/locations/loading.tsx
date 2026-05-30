// ── Phase 11 batch 11h — /client/locations route-level loading skeleton ────────
// Mirrors the (client)/client/jobs loading convention.

export default function ClientLocationsLoading() {
  return (
    <section className="max-w-5xl space-y-8">
      <div className="h-8 w-40 animate-pulse rounded bg-neutral-200" />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="h-24 animate-pulse rounded-lg bg-neutral-100" />
        ))}
      </ul>
    </section>
  );
}
