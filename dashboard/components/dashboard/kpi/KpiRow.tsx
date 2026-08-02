import { getDashboardKpis } from "@/lib/analytics/kpis";
import type { AnalyticsScope, DashboardKpis, KpiSummary } from "@/lib/analytics/types";
import { KpiTile } from "./KpiTile";

function money(currency: string) {
  const nf = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  return (n: number) => nf.format(n);
}

function integer() {
  const nf = new Intl.NumberFormat("en-US");
  return (n: number) => nf.format(Math.round(n));
}

interface TileSpec {
  label: string;
  summary: KpiSummary;
  format: (n: number) => string;
  isMoney: boolean;
}

export async function KpiRow({ scope }: { scope: AnalyticsScope }) {
  const kpis: DashboardKpis = await getDashboardKpis(scope);

  const fmtMoney = money(scope.currency);
  const fmtInt = integer();

  const tiles: TileSpec[] = [
    { label: "Revenue", summary: kpis.revenue, format: fmtMoney, isMoney: true },
    { label: "Orders", summary: kpis.orders, format: fmtInt, isMoney: false },
    { label: "Unique customers", summary: kpis.uniqueCustomers, format: fmtInt, isMoney: false },
    { label: "AOV", summary: kpis.aov, format: fmtMoney, isMoney: true },
    { label: "New customers", summary: kpis.newCustomers, format: fmtInt, isMoney: false },
    { label: "Repeat customers", summary: kpis.repeatCustomers, format: fmtInt, isMoney: false },
    { label: "Items sold", summary: kpis.itemsSold, format: fmtInt, isMoney: false },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.slice(0, 4).map((t) => renderTile(t))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.slice(4).map((t) => renderTile(t))}
      </div>
    </div>
  );
}

function renderTile({ label, summary, format, isMoney }: TileSpec) {
  const isEmpty = summary.current === 0 && summary.deltaPrev.previous === 0 && summary.deltaYoy.previous === 0;
  return (
    <KpiTile
      key={label}
      label={label}
      value={format(summary.current)}
      isEmpty={isEmpty}
      deltaPrev={summary.deltaPrev}
      deltaYoy={summary.deltaYoy}
      formatNominal={isMoney ? format : (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n))}
    />
  );
}
