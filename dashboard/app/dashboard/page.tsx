import { Suspense } from "react";
import { requireAccountId } from "@/lib/session-helpers";
import { getStoresForOwner } from "@/lib/repository/stores";
import { parseDashboardSearchParams } from "@/lib/dashboard/search-params";
import { resolveWindow } from "@/lib/analytics/timeframe";
import type { AnalyticsScope } from "@/lib/analytics/types";

import { DashboardFilters } from "@/components/dashboard/filters/DashboardFilters";
import { KpiRow } from "@/components/dashboard/kpi/KpiRow";
import { PanelCard } from "@/components/dashboard/shared/PanelCard";
import { ChartSkeleton } from "@/components/dashboard/shared/ChartSkeleton";
import { RevenueTrendChart } from "@/components/dashboard/charts/RevenueTrendChart";
import { StoreLeaderboardChart } from "@/components/dashboard/charts/StoreLeaderboardChart";
import { CategoryShareChart } from "@/components/dashboard/charts/CategoryShareChart";
import { NewVsReturningChart } from "@/components/dashboard/charts/NewVsReturningChart";
import { TopProductsTable } from "@/components/dashboard/tables/TopProductsTable";
import { TopCustomersTable } from "@/components/dashboard/tables/TopCustomersTable";
import { InventoryAlertsPanel } from "@/components/dashboard/inventory/InventoryAlertsPanel";

import { getRevenueTimeSeries } from "@/lib/analytics/revenue";
import { getTopProducts } from "@/lib/analytics/products";
import { getCategoryShare } from "@/lib/analytics/categories";
import { getStoreLeaderboard } from "@/lib/analytics/stores";
import { getCustomerMix, getTopCustomers } from "@/lib/analytics/customers";
import { getLowStockAlerts } from "@/lib/analytics/inventory";

type SP = Record<string, string | string[] | undefined>;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ownerId = await requireAccountId();
  const stores = await getStoresForOwner(ownerId);
  const sp = await searchParams;
  const parsed = parseDashboardSearchParams(sp);

  const defaultCurrency = stores[0]?.baseCurrency ?? "USD";
  const currency = parsed.currency ?? defaultCurrency;
  const window = resolveWindow(parsed.range, parsed.from, parsed.to);
  const scope: AnalyticsScope = {
    ownerId,
    storeId: parsed.storeId,
    from: window.from,
    to: window.to,
    currency,
  };
  const prevScope: AnalyticsScope = { ...scope, from: window.previousFrom, to: window.previousTo };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Live analytics across your stores.</p>
        </div>
        <DashboardFilters stores={stores} range={parsed.range} storeId={parsed.storeId} currency={currency} />
      </header>

      <Suspense fallback={<ChartSkeleton height={96} />}>
        <KpiRow scope={scope} />
      </Suspense>

      <div className="mt-6">
        <PanelCard title="Revenue trend" subtitle={`${parsed.range} view, ${currency}`}>
          <Suspense fallback={<ChartSkeleton />}>
            <RevenueTrendPanel scope={scope} prevScope={prevScope} range={parsed.range} />
          </Suspense>
        </PanelCard>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <PanelCard title="Store leaderboard">
          <Suspense fallback={<ChartSkeleton height={280} />}>
            <StoreLeaderboardPanel scope={scope} />
          </Suspense>
        </PanelCard>
        <PanelCard title="Category share">
          <Suspense fallback={<ChartSkeleton height={280} />}>
            <CategorySharePanel scope={scope} />
          </Suspense>
        </PanelCard>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <PanelCard title="Top products">
          <Suspense fallback={<ChartSkeleton height={200} />}>
            <TopProductsPanel scope={scope} />
          </Suspense>
        </PanelCard>
        <PanelCard title="Inventory alerts">
          <Suspense fallback={<ChartSkeleton height={200} />}>
            <InventoryPanel scope={scope} />
          </Suspense>
        </PanelCard>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <PanelCard title="New vs returning customers">
          <Suspense fallback={<ChartSkeleton height={260} />}>
            <CustomerMixPanel scope={scope} />
          </Suspense>
        </PanelCard>
        <PanelCard title="Top customers">
          <Suspense fallback={<ChartSkeleton height={200} />}>
            <TopCustomersPanel scope={scope} />
          </Suspense>
        </PanelCard>
      </div>
    </main>
  );
}

async function RevenueTrendPanel({ scope, prevScope, range }: { scope: AnalyticsScope; prevScope: AnalyticsScope; range: "daily" | "weekly" | "monthly" }) {
  const [cur, prev] = await Promise.all([
    getRevenueTimeSeries(scope, range),
    getRevenueTimeSeries(prevScope, range),
  ]);
  return <RevenueTrendChart currentSeries={cur} previousSeries={prev} currency={scope.currency} />;
}
async function StoreLeaderboardPanel({ scope }: { scope: AnalyticsScope }) {
  const rows = await getStoreLeaderboard(scope);
  return <StoreLeaderboardChart rows={rows} currency={scope.currency} />;
}
async function CategorySharePanel({ scope }: { scope: AnalyticsScope }) {
  const rows = await getCategoryShare(scope);
  return <CategoryShareChart rows={rows} />;
}
async function TopProductsPanel({ scope }: { scope: AnalyticsScope }) {
  const rows = await getTopProducts(scope);
  return <TopProductsTable rows={rows} currency={scope.currency} />;
}
async function InventoryPanel({ scope }: { scope: AnalyticsScope }) {
  const rows = await getLowStockAlerts(scope);
  return <InventoryAlertsPanel rows={rows} />;
}
async function CustomerMixPanel({ scope }: { scope: AnalyticsScope }) {
  const mix = await getCustomerMix(scope);
  return <NewVsReturningChart newCount={mix.newCount.current} returningCount={mix.returningCount.current} />;
}
async function TopCustomersPanel({ scope }: { scope: AnalyticsScope }) {
  const rows = await getTopCustomers(scope);
  return <TopCustomersTable rows={rows} currency={scope.currency} />;
}
