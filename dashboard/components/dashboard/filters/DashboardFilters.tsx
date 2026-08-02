import { CurrencySelector } from "./CurrencySelector";
import { RangeSelector } from "./RangeSelector";
import { StoreSelector } from "./StoreSelector";
import type { Range } from "@/lib/analytics/types";

type Store = { id: number; name: string };

export function DashboardFilters({
  stores, range, storeId, currency,
}: { stores: Store[]; range: Range; storeId?: number; currency: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StoreSelector stores={stores} value={storeId} />
      <CurrencySelector value={currency} />
      <RangeSelector value={range} />
    </div>
  );
}
