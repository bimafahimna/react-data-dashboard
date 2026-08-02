import type { StockRow } from "@/lib/analytics/inventory";
import { EmptyState } from "../shared/EmptyState";

export function InventoryAlertsPanel({ rows }: { rows: StockRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="All inventory is healthy." hint="No items below their reorder point." />;
  }
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {rows.map((r) => (
        <li key={`${r.storeId}-${r.productId}`} className="flex items-center justify-between px-1 py-2">
          <div>
            <p className="font-medium text-slate-800">{r.name}</p>
            <p className="text-xs text-slate-500">{r.storeName} · reorder at {r.reorderPoint}</p>
          </div>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
            r.status === "OUT" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"
          }`}>
            {r.status === "OUT" ? "OUT" : `LOW · ${r.onHand}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
