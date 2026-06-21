import { requireTenant } from "@/server/auth-context";
import { getExceptions } from "@/server/analytics/exceptions";
import { ExceptionQueue } from "@/components/exception-queue";
import { AutoRedispatchSweepButton } from "@/components/auto-redispatch-sweep-button";

// Phase 19e — the notification center / exception queue. PULL surface (operator navigates
// here; no realtime/push/badge — design §5). Today it hosts the exception queue over
// getExceptions; the route is named to host future feeds (autonomy events, spend-ceiling)
// without a rename. requireTenant mirrors /review.
export default async function NotificationsPage() {
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;
  const items = await getExceptions(tenantId);

  // The sweep is meaningful only when something is auto-retryable — render it exactly when there is
  // at least one can_suggest stuck row (it disappears after a successful sweep on revalidate).
  const hasSweepable = items.some(
    (i) => i.kind === "vendor_not_accepted" && i.redispatchState === "can_suggest",
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {hasSweepable && <AutoRedispatchSweepButton />}
      </div>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">No exceptions.</p>
      ) : (
        <ExceptionQueue items={items} />
      )}
    </div>
  );
}
