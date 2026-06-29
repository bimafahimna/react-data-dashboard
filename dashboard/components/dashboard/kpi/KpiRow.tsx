import { getRevenueSummary } from "@/lib/analytics/revenue";
import { getCustomerMix } from "@/lib/analytics/customers";
import type { AnalyticsScope } from "@/lib/analytics/types";
import { KpiTile } from "./KpiTile";

export async function KpiRow({ scope }: { scope: AnalyticsScope }) {
  const [rev, mix] = await Promise.all([
    getRevenueSummary(scope),
    getCustomerMix(scope),
  ]);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiTile
        label="Revenue"
        value={rev.revenue.current}
        delta={rev.revenue}
        format={{ kind: "currency", currency: scope.currency, emptyWhenZero: true }}
      />
      <KpiTile
        label="Orders"
        value={rev.orders.current}
        delta={rev.orders}
        format={{ kind: "integer", emptyWhenZero: true }}
      />
      <KpiTile
        label="AOV"
        value={rev.aov.current}
        delta={rev.aov}
        format={{ kind: "currency", currency: scope.currency, emptyWhenZero: true }}
      />
      <KpiTile
        label="New customers"
        value={mix.newCount.current}
        delta={mix.newCount}
        format={{ kind: "integer", emptyWhenZero: true }}
      />
    </div>
  );
}
