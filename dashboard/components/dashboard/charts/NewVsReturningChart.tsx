"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "../shared/EmptyState";

type Props = { newCount: number; returningCount: number };

export function NewVsReturningChart({ newCount, returningCount }: Props) {
  if (newCount + returningCount === 0) return <EmptyState title="No customers in this period." />;
  const data = [{ label: "Customers", new: newCount, returning: returningCount }];
  return (
    <div className="h-[260px] w-full" role="img" aria-label={`Customer mix: ${newCount} new, ${returningCount} returning`}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#475569" }} />
          <YAxis tick={{ fontSize: 12, fill: "#475569" }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="new" name="New" stackId="a" fill="#6366f1" />
          <Bar dataKey="returning" name="Returning" stackId="a" fill="#10b981" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
