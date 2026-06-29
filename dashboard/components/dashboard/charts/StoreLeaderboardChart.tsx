"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { EmptyState } from "../shared/EmptyState";

type Row = { storeId: number; name: string; revenue: number; orders: number; aov: number };

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6"];

export function StoreLeaderboardChart({ rows, currency }: { rows: Row[]; currency: string }) {
  if (rows.length === 0) return <EmptyState title="No store activity yet." />;
  const formatter = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  return (
    <div className="h-[280px] w-full" role="img" aria-label="Store leaderboard by revenue">
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 12, fill: "#475569" }} tickFormatter={(v) => formatter(Number(v))} />
          <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: "#475569" }} width={120} />
          <Tooltip formatter={(v) => formatter(Number(v ?? 0))} />
          <Bar dataKey="revenue" name="Revenue">
            {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
