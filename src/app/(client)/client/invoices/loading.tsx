// ── Phase 11 batch 11i — /client/invoices route-level loading skeleton ─────────
// Mirrors the (client)/client/locations loading convention.

export default function ClientInvoicesLoading() {
  return (
    <section className="max-w-5xl space-y-8">
      <div className="h-8 w-40 animate-pulse rounded bg-neutral-200" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100" />
        ))}
      </div>
    </section>
  );
}
