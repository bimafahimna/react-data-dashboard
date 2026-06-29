import { TrendingDown, TrendingUp } from "lucide-react";
import type { Delta } from "@/lib/analytics/types";
import { formatDelta, formatKpiValue, type ValueFormat } from "./formatDelta";

type Props = {
  label: string;
  value: number;
  delta?: Delta;
  format: ValueFormat;
};

export function KpiTile({ label, value, delta, format }: Props) {
  const formatted = delta ? formatDelta(delta) : null;
  const isEmpty = format.emptyWhenZero && value === 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{formatKpiValue(value, format)}</p>
      {!isEmpty && formatted && (
        <p
          className={`mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
            formatted.tone === "up" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {formatted.tone === "up" ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
          <span>{formatted.text}</span>
          <span className="sr-only">{formatted.tone === "up" ? "up" : "down"} vs previous period</span>
        </p>
      )}
    </div>
  );
}
