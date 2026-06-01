import Link from "next/link";
import { requireTenant } from "@/server/auth-context";
import { listPendingReviewDraftsDetailed } from "@/server/agents/drafts";
import { listVendorUpdates } from "@/server/job-notes";
import { ReviewQueueSection } from "@/components/review-queue-section";
import { VendorUpdatesInbox } from "@/components/vendor-updates-inbox";

// Phase 18 — the operator review surface. Two tabs over one route:
//   ?tab=drafts (default)        → tenant-wide AI-draft review queue (18b)
//   ?tab=vendor-updates          → tenant-wide vendor-updates inbox (18c, FB-10a.3)
// searchParams-based tabs keep this a Server Component (SSR, no client state).
// PULL only; requireTenant mirrors jobs/page.tsx.
const TABS = [
  { key: "drafts", label: "Drafts" },
  { key: "vendor-updates", label: "Vendor updates" },
] as const;

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;
  const { tab } = await searchParams;
  const active = tab === "vendor-updates" ? "vendor-updates" : "drafts";

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
      </div>

      <nav className="mt-4 flex items-center gap-4 border-b border-neutral-200 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "drafts" ? "/review" : `/review?tab=${t.key}`}
            className={
              active === t.key
                ? "-mb-px border-b-2 border-neutral-900 pb-2 font-medium text-neutral-900"
                : "-mb-px border-b-2 border-transparent pb-2 text-neutral-500 hover:text-neutral-800"
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {active === "drafts" ? (
        <DraftsTab tenantId={tenantId} />
      ) : (
        <VendorUpdatesTab tenantId={tenantId} />
      )}
    </div>
  );
}

async function DraftsTab({ tenantId }: { tenantId: string }) {
  const items = await listPendingReviewDraftsDetailed(tenantId);
  return items.length === 0 ? (
    <p className="mt-8 text-sm text-neutral-600">No drafts awaiting review.</p>
  ) : (
    <ReviewQueueSection items={items} />
  );
}

async function VendorUpdatesTab({ tenantId }: { tenantId: string }) {
  const items = await listVendorUpdates(tenantId);
  return items.length === 0 ? (
    <p className="mt-8 text-sm text-neutral-600">No vendor updates.</p>
  ) : (
    <VendorUpdatesInbox items={items} />
  );
}
