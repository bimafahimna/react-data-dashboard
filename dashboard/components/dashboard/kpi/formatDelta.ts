import type { Delta } from "@/lib/analytics/types";

export type KpiTone = "up" | "down";
export interface FormattedDelta { text: string; tone: KpiTone }

export function formatDelta(d: Delta): FormattedDelta | null {
  if (d.previous === 0 || d.direction === "flat") return null;
  const sign = d.changePct >= 0 ? "+" : "-";
  return { text: `${sign}${Math.abs(d.changePct).toFixed(1)}%`, tone: d.direction === "up" ? "up" : "down" };
}

export type ValueFormat =
  | { kind: "currency"; currency: string; emptyWhenZero?: boolean }
  | { kind: "integer"; emptyWhenZero?: boolean }
  | { kind: "decimal"; digits?: number; emptyWhenZero?: boolean };

export function formatKpiValue(value: number, fmt: ValueFormat): string {
  if (fmt.emptyWhenZero && value === 0) return "—";
  if (fmt.kind === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: fmt.currency,
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (fmt.kind === "integer") {
    return new Intl.NumberFormat("en-US").format(Math.round(value));
  }
  return value.toFixed(fmt.digits ?? 2);
}
