"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ProductRow } from "@/lib/analytics/products";
import { EmptyState } from "../shared/EmptyState";

type SortKey = "revenue" | "units" | "growthPct";

export function TopProductsTable({ rows, currency }: { rows: ProductRow[]; currency: string }) {
  const [sort, setSort] = useState<SortKey>("revenue");
  const [desc, setDesc] = useState(true);
  if (rows.length === 0) return <EmptyState title="No products sold in this period." />;

  const sorted = [...rows].sort((a, b) => (desc ? b[sort] - a[sort] : a[sort] - b[sort]));
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  const toggle = (k: SortKey) => {
    if (sort === k) setDesc(!desc);
    else { setSort(k); setDesc(true); }
  };
  const Arrow = desc ? ArrowDown : ArrowUp;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-3 py-2">#</th>
            <th scope="col" className="px-3 py-2">Product</th>
            <th scope="col" className="px-3 py-2">Category</th>
            <th scope="col" className="px-3 py-2 cursor-pointer" onClick={() => toggle("revenue")}>
              Revenue {sort === "revenue" && <Arrow size={12} className="inline" />}
            </th>
            <th scope="col" className="px-3 py-2 cursor-pointer" onClick={() => toggle("units")}>
              Units {sort === "units" && <Arrow size={12} className="inline" />}
            </th>
            <th scope="col" className="px-3 py-2 cursor-pointer" onClick={() => toggle("growthPct")}>
              Growth {sort === "growthPct" && <Arrow size={12} className="inline" />}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((r, i) => (
            <tr key={r.productId}>
              <td className="px-3 py-2 text-slate-400">{i + 1}</td>
              <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
              <td className="px-3 py-2 text-slate-500">{r.category}</td>
              <td className="px-3 py-2 text-slate-700">{fmtMoney(r.revenue)}</td>
              <td className="px-3 py-2 text-slate-700">{r.units}</td>
              <td className="px-3 py-2">
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                  r.growthPct >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                }`}>
                  {r.growthPct >= 0 ? "+" : ""}{r.growthPct.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
