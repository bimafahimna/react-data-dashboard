import type { TopCustomerRow } from "@/lib/analytics/customers";
import { EmptyState } from "../shared/EmptyState";

export function TopCustomersTable({ rows, currency }: { rows: TopCustomerRow[]; currency: string }) {
  if (rows.length === 0) return <EmptyState title="No customers in this period." />;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-3 py-2">Customer</th>
            <th scope="col" className="px-3 py-2">Orders</th>
            <th scope="col" className="px-3 py-2">Spend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.customerId}>
              <td className="px-3 py-2 font-medium text-slate-800">{r.email}</td>
              <td className="px-3 py-2 text-slate-700">{r.orders}</td>
              <td className="px-3 py-2 text-slate-700">{fmt(r.spend)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
