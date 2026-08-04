"use client";

import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { TimeSeriesPoint } from "@/lib/analytics/types";
import { EmptyState } from "../shared/EmptyState";

type Props = {
  currentSeries: TimeSeriesPoint[];
  currency: string;
};

const LINE_COLOR = "#6366f1";
const GRADIENT_ID = "revenueTrendShadow";

export function RevenueTrendChart({ currentSeries, currency }: Props) {
  if (currentSeries.length === 0) {
    return <EmptyState title="No paid orders in this period." hint="Add orders to your store to see revenue trends." />;
  }
  const data = currentSeries.map((p) => ({ label: p.label, current: p.value }));
  const formatter = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="h-[320px] w-full" role="img" aria-label={`Revenue trend, ${currency}, ${currentSeries.length} buckets`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <defs>
            <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.25} />
              <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#475569" }} />
          <YAxis tick={{ fontSize: 12, fill: "#475569" }} tickFormatter={(v) => formatter(Number(v))} width={80} />
          <Tooltip formatter={(v) => formatter(Number(v ?? 0))} labelClassName="font-semibold" />
          <Area
            type="monotone"
            dataKey="current"
            name="Revenue"
            stroke={LINE_COLOR}
            strokeWidth={2}
            fill={`url(#${GRADIENT_ID})`}
            fillOpacity={1}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
