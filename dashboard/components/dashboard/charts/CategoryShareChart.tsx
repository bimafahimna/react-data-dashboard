"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "../shared/EmptyState";

type Row = { category: string; revenue: number; share: number };
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#84cc16"];

export function CategoryShareChart({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <EmptyState title="No category data for this period." />;
  return (
    <div className="h-[280px] w-full" role="img" aria-label="Revenue share by category">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={rows} dataKey="revenue" nameKey="category" innerRadius={60} outerRadius={90} paddingAngle={2}>
            {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            formatter={(_v, _n, item) => {
              const row = item.payload as Row;
              return [`${(row.share * 100).toFixed(1)}%`, row.category];
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
