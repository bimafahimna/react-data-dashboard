"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { PerStoreKpiRow } from "@/lib/analytics/types";

type NumericKey =
  | "revenue"
  | "orders"
  | "uniqueCustomers"
  | "aov"
  | "newCustomers"
  | "repeatCustomers"
  | "itemsSold";

type SortKey = "storeName" | NumericKey;
type SortDir = "asc" | "desc";

interface ColumnDef {
  key: SortKey;
  label: string;
  numeric: boolean;
  align: "left" | "right";
}

const COLUMNS: ColumnDef[] = [
  { key: "storeName", label: "Store", numeric: false, align: "left" },
  { key: "revenue", label: "Revenue", numeric: true, align: "right" },
  { key: "orders", label: "Orders", numeric: true, align: "right" },
  { key: "uniqueCustomers", label: "Unique", numeric: true, align: "right" },
  { key: "aov", label: "AOV", numeric: true, align: "right" },
  { key: "newCustomers", label: "New", numeric: true, align: "right" },
  { key: "repeatCustomers", label: "Repeat", numeric: true, align: "right" },
  { key: "itemsSold", label: "Items", numeric: true, align: "right" },
];

interface Props {
  rows: PerStoreKpiRow[];
  currency: string;
}

function isZeroRow(r: PerStoreKpiRow): boolean {
  return (
    r.revenue === 0 &&
    r.orders === 0 &&
    r.uniqueCustomers === 0 &&
    r.newCustomers === 0 &&
    r.repeatCustomers === 0 &&
    r.itemsSold === 0
  );
}

function cmpNumeric(a: number, b: number, dir: SortDir): number {
  return dir === "asc" ? a - b : b - a;
}
function cmpString(a: string, b: string, dir: SortDir): number {
  return dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

function ariaSortFor(active: boolean, dir: SortDir): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

export function PerStoreKpiTable({ rows, currency }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "storeName") return cmpString(a.storeName, b.storeName, sortDir);
      return cmpNumeric(a[sortKey], b[sortKey], sortDir);
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const money = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
    [currency],
  );
  const int = useMemo(() => new Intl.NumberFormat("en-US"), []);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(COLUMNS.find((c) => c.key === key)?.numeric ? "desc" : "asc");
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-slate-600">No stores yet.</p>
        <Link
          href="/dashboard/stores"
          className="mt-2 inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          Create your first store →
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Per-store breakdown</h3>
        <p className="mt-0.5 text-xs text-slate-500">Current period only. Click a column to sort.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">
            KPIs per store for the current selected period, sorted by {COLUMNS.find((c) => c.key === sortKey)?.label} {sortDir === "asc" ? "ascending" : "descending"}.
          </caption>
          <thead>
            <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              {COLUMNS.map((c) => {
                const active = c.key === sortKey;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={ariaSortFor(active, sortDir)}
                    className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : "text-left"}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(c.key)}
                      className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                        c.align === "right" ? "justify-end" : "justify-start"
                      } ${active ? "text-slate-900" : ""}`}
                    >
                      <span>{c.label}</span>
                      {active ? (
                        sortDir === "asc" ? (
                          <ArrowUp size={12} aria-hidden />
                        ) : (
                          <ArrowDown size={12} aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDown size={12} aria-hidden className="opacity-50" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const zero = isZeroRow(r);
              const cell = (n: number, kind: "money" | "int") => {
                if (zero) return <span className="text-slate-400">—</span>;
                return kind === "money" ? money.format(n) : int.format(Math.round(n));
              };
              return (
                <tr key={r.storeId} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-left">
                    <div className="font-medium text-slate-900">{r.storeName}</div>
                    <div className="text-xs text-slate-500">{r.location}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{cell(r.revenue, "money")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{cell(r.orders, "int")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{cell(r.uniqueCustomers, "int")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{cell(r.aov, "money")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{cell(r.newCustomers, "int")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{cell(r.repeatCustomers, "int")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{cell(r.itemsSold, "int")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
