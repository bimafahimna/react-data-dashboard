import { CurrencySelector } from "./CurrencySelector";
import { DateRangeSelector } from "./DateRangeSelector";
import { RangeSelector } from "./RangeSelector";
import { StoreSelector } from "./StoreSelector";
import type { Range } from "@/lib/analytics/types";

type Store = { id: number; name: string };

export function DashboardFilters({
  stores, range, storeId, currency, from, to,
}: {
  stores: Store[];
  range: Range;
  storeId?: number;
  currency: string;
  from?: string;
  to?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StoreSelector stores={stores} value={storeId} />
      <CurrencySelector value={currency} />
      <RangeSelector value={range} />
      <DateRangeSelector from={from} to={to} />
    </div>
  );
}
