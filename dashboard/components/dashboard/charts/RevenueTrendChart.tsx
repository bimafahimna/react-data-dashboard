"use client";

import {
  Area, Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { TimeSeriesPoint } from "@/lib/analytics/types";
import { EmptyState } from "../shared/EmptyState";

type Props = {
  currentSeries: TimeSeriesPoint[];
  previousSeries: TimeSeriesPoint[];
  currency: string;
};

export function RevenueTrendChart({ currentSeries, previousSeries, currency }: Props) {
  if (currentSeries.length === 0) {
    return <EmptyState title="No paid orders in this period." hint="Add orders to your store to see revenue trends." />;
  }
  const data = currentSeries.map((p, i) => ({
    label: p.label,
    current: p.value,
    previous: previousSeries[i]?.value ?? null,
  }));
  const formatter = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="h-[320px] w-full" role="img" aria-label={`Revenue trend, ${currency}, ${currentSeries.length} buckets`}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#475569" }} />
          <YAxis tick={{ fontSize: 12, fill: "#475569" }} tickFormatter={(v) => formatter(Number(v))} width={80} />
          <Tooltip formatter={(v) => formatter(Number(v ?? 0))} labelClassName="font-semibold" />
          <Legend />
          <Bar dataKey="previous" name="Previous period" fill="#cbd5f5" />
          <Area type="monotone" dataKey="current" name="Revenue" stroke="#6366f1" fill="#c7d2fe" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
