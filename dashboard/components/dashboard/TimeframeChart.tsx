"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TrendingDown, TrendingUp } from "lucide-react";

type Timeframe = "daily" | "weekly" | "monthly";

interface MetricDailyRecord {
  date: Date;
  visitors: number;
  revenue: number;
  conversionRate: number;
}

interface ChartPoint {
  label: string;
  value: number;
}

interface ChartCoord extends ChartPoint {
  x: number;
  y: number;
}

type MetricKey = "visitors" | "revenue" | "conversionRate";

type StoreSeriesInput = {
  storeId: number;
  storeName: string;
  records: { date: Date; value: number }[];
};

interface MetricSeries {
  key: MetricKey;
  label: string;
  color: string;
  suffix?: string;
  prefix?: string;
  points: ChartPoint[];
  coords: ChartCoord[];
  path: string;
}

const TIMEFRAME_ORDER: Timeframe[] = ["daily", "weekly", "monthly"];

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function generateRawDailyData(days: number, seed: number): MetricDailyRecord[] {
  const now = new Date(Date.UTC(2026, 3, 29));
  const records: MetricDailyRecord[] = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);

    const day = date.getDate();
    const seasonal = Math.sin((day / 31) * Math.PI + seed * 0.3);
    const trend = days - i;
    const visitors = Math.max(250, Math.round(920 + seasonal * 220 + trend * (4 + (seed % 4))));
    const conversionRate = Number(
      Math.max(1.2, Math.min(6.8, 2.6 + seasonal * 0.65 + trend * 0.01 + ((seed + day) % 9) * 0.04)).toFixed(2)
    );
    const avgOrderValue = Number(
      Math.max(22, 38 + ((seed + day) % 14) * 2.2 + Math.cos((day / 31) * Math.PI + seed * 0.2) * 4.5).toFixed(2)
    );
    const revenue = Math.max(1400, Math.round(visitors * (conversionRate / 100) * avgOrderValue));

    records.push({
      date,
      visitors,
      revenue,
      conversionRate,
    });
  }

  return records;
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getWeekStart(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const delta = day === 0 ? 6 : day - 1;
  copy.setDate(copy.getDate() - delta);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatWeekLabel(weekStart: Date): string {
  return `Wk ${weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short" });
}

function aggregateData(records: MetricDailyRecord[], timeframe: Timeframe, metric: MetricKey): ChartPoint[] {
  const pickValue = (record: MetricDailyRecord) => record[metric];

  if (timeframe === "daily") {
    return records.slice(-7).map((record) => ({
      label: formatDayLabel(record.date),
      value: Number(pickValue(record).toFixed(metric === "conversionRate" ? 2 : 0)),
    }));
  }

  if (timeframe === "weekly") {
    const groups = new Map<string, { label: string; total: number; count: number; time: number }>();

    for (const record of records) {
      const weekStart = getWeekStart(record.date);
      const key = weekStart.toISOString().slice(0, 10);
      const existing = groups.get(key);
      const currentValue = pickValue(record);

      if (existing) {
        existing.total += currentValue;
        existing.count += 1;
      } else {
        groups.set(key, {
          label: formatWeekLabel(weekStart),
          total: currentValue,
          count: 1,
          time: weekStart.getTime(),
        });
      }
    }

    return Array.from(groups.values())
      .sort((a, b) => a.time - b.time)
      .slice(-8)
      .map((item) => ({
        label: item.label,
        value: Number((item.total / item.count).toFixed(metric === "conversionRate" ? 2 : 0)),
      }));
  }

  const months = new Map<string, { label: string; total: number; count: number; time: number }>();

  for (const record of records) {
    const monthDate = new Date(record.date.getFullYear(), record.date.getMonth(), 1);
    const key = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
    const existing = months.get(key);
    const currentValue = pickValue(record);

    if (existing) {
      existing.total += currentValue;
      existing.count += 1;
    } else {
      months.set(key, {
        label: formatMonthLabel(monthDate),
        total: currentValue,
        count: 1,
        time: monthDate.getTime(),
      });
    }
  }

  return Array.from(months.values())
    .sort((a, b) => a.time - b.time)
    .slice(-6)
    .map((item) => ({
      label: item.label,
      value: Number((item.total / item.count).toFixed(metric === "conversionRate" ? 2 : 0)),
    }));
}

function buildTrend(points: ChartPoint[]) {
  if (points.length < 2) {
    return {
      direction: "up" as const,
      changePct: 0,
    };
  }

  const first = points[0].value;
  const last = points[points.length - 1].value;
  const changePct = ((last - first) / first) * 100;
  const direction = changePct >= 0 ? "up" : "down";
  return {
    direction,
    changePct: Math.abs(changePct),
  };
}

function getAverage(points: ChartPoint[]) {
  if (points.length === 0) return 0;
  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

function buildChartGeometry(
  series: { key: MetricKey; points: ChartPoint[]; color: string; label: string; prefix?: string; suffix?: string }[],
  width: number,
  height: number,
  padX = 10,
  padY = 18
) {
  const allValues = series.flatMap((item) => item.points.map((point) => point.value));
  if (allValues.length === 0) {
    return [] as MetricSeries[];
  }

  const max = Math.max(...allValues);
  const min = Math.min(...allValues);
  const span = Math.max(1, max - min);

  return series.map((item) => {
    const points = item.points;

  if (points.length === 0) {
    return {
      key: item.key,
      label: item.label,
      color: item.color,
      prefix: item.prefix,
      suffix: item.suffix,
      points,
      coords: [] as ChartCoord[],
      path: "",
    };
  }

  const xStep = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;

  const coords: ChartCoord[] = points.map((point, index) => {
    const x = padX + index * xStep;
    const normalized = (point.value - min) / span;
    const y = height - padY - normalized * (height - padY * 2);
    return { ...point, x, y };
  });

  const path = coords
    .map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`)
    .join(" ");

    return {
      key: item.key,
      label: item.label,
      color: item.color,
      prefix: item.prefix,
      suffix: item.suffix,
      points,
      coords,
      path,
    };
  });
}

const FALLBACK_SERIES: StoreSeriesInput[] = [
  { storeId: 1, storeName: "Main Store", records: [{ date: new Date(), value: 1 }] },
];
const METRIC_COLORS: Record<MetricKey, string> = {
  visitors: "#6366f1",
  revenue: "#10b981",
  conversionRate: "#f59e0b",
};

type TimeframeChartProps = {
  storesData?: StoreSeriesInput[];
};

export default function TimeframeChart({ storesData = FALLBACK_SERIES }: TimeframeChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("daily");
  const [hoveredPoint, setHoveredPoint] = useState<(ChartCoord & { metricLabel: string; color: string; prefix?: string; suffix?: string }) | null>(null);

  const rawMetrics = useMemo(() => {
    const seedBase = storesData.reduce((sum, store) => sum + store.storeId + store.storeName.length, 0) || 11;
    return generateRawDailyData(140, seedBase);
  }, [storesData]);

  const visitorsPoints = useMemo(() => aggregateData(rawMetrics, timeframe, "visitors"), [rawMetrics, timeframe]);
  const revenuePoints = useMemo(() => aggregateData(rawMetrics, timeframe, "revenue"), [rawMetrics, timeframe]);
  const conversionPoints = useMemo(
    () => aggregateData(rawMetrics, timeframe, "conversionRate"),
    [rawMetrics, timeframe]
  );

  const computedSeries = useMemo(
    () =>
      buildChartGeometry(
        [
          { key: "visitors", label: "Visitors", color: METRIC_COLORS.visitors, points: visitorsPoints },
          { key: "revenue", label: "Revenue", color: METRIC_COLORS.revenue, points: revenuePoints, prefix: "$" },
          { key: "conversionRate", label: "Conversion Rate", color: METRIC_COLORS.conversionRate, points: conversionPoints, suffix: "%" },
        ],
        760,
        280
      ),
    [visitorsPoints, revenuePoints, conversionPoints]
  );

  const revenueTrend = useMemo(() => buildTrend(revenuePoints), [revenuePoints]);
  const averageRevenue = useMemo(() => getAverage(revenuePoints), [revenuePoints]);
  const averageConversionRate = useMemo(() => getAverage(conversionPoints), [conversionPoints]);
  const summaryPoints = useMemo(() => revenuePoints.slice(-4), [revenuePoints]);
  const formattedAverageRevenue = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(averageRevenue);

  return (
    <section className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Performance Overview</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>Trend shows revenue</span>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                revenueTrend.direction === "up" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}
            >
              {revenueTrend.direction === "up" ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {revenueTrend.changePct.toFixed(1)}%
            </span>
            <span>in this {timeframe} view.</span>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {TIMEFRAME_ORDER.map((item) => {
            const active = item === timeframe;
            return (
              <Button
                key={item}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTimeframe(item)}
                className={
                  active
                    ? "bg-indigo-200 text-slate-900 hover:bg-indigo-300 hover:text-slate-900"
                    : "text-slate-600 hover:bg-white"
                }
              >
                {TIMEFRAME_LABELS[item]}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl rounded-xl border border-slate-100 bg-slate-50 p-4">
        <div className="relative">
          {hoveredPoint && (
            <div
              className="pointer-events-none absolute z-10 w-36 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
              style={{
                left: `clamp(0px, calc(${((hoveredPoint.x / 760) * 100).toFixed(2)}% - 72px), calc(100% - 144px))`,
                top: `calc(${((hoveredPoint.y / 280) * 100).toFixed(2)}% - 64px)`,
              }}
            >
              <p className="text-[11px] font-medium" style={{ color: hoveredPoint.color }}>
                {hoveredPoint.metricLabel}
              </p>
              <p className="text-[11px] text-slate-400">{hoveredPoint.label}</p>
              <p className="text-sm font-semibold text-slate-800">
                {hoveredPoint.prefix ?? ""}
                {hoveredPoint.value}
                {hoveredPoint.suffix ?? ""}
              </p>
            </div>
          )}

          <svg
            viewBox="0 0 760 280"
            role="img"
            aria-label="Trend chart"
            className="h-[280px] w-full"
            onMouseLeave={() => setHoveredPoint(null)}
          >
            {computedSeries.map((series) => (
              <g key={series.key}>
                <path
                  d={series.path}
                  fill="none"
                  stroke={series.color}
                  strokeWidth="2.75"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {series.coords.map((point) => {
                  const isActive =
                    hoveredPoint?.label === point.label && hoveredPoint?.metricLabel === series.label;
                  return (
                    <g key={`${series.key}-${point.label}-${point.value}`}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={8}
                        fill="transparent"
                        onMouseEnter={() =>
                          setHoveredPoint({
                            ...point,
                            metricLabel: series.label,
                            color: series.color,
                            prefix: series.prefix,
                            suffix: series.suffix,
                          })
                        }
                      />
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={isActive ? 4.5 : 3.5}
                        fill={series.color}
                        stroke="#fff"
                        strokeWidth="1.5"
                      />
                    </g>
                  );
                })}
              </g>
            ))}
          </svg>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {computedSeries.map((series) => (
            <div
              key={`legend-${series.key}`}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color }} />
              {series.label}
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
          <div className="rounded-md bg-white px-3 py-2">
            <p className="text-slate-400">Average revenue ({TIMEFRAME_LABELS[timeframe]})</p>
            <p className="font-semibold text-slate-700">{formattedAverageRevenue}</p>
          </div>
          <div className="rounded-md bg-white px-3 py-2">
            <p className="text-slate-400">Average conversion rate ({TIMEFRAME_LABELS[timeframe]})</p>
            <p className="font-semibold text-slate-700">{averageConversionRate.toFixed(2)}%</p>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500 md:grid-cols-4">
          {summaryPoints.map((point) => (
            <div key={point.label} className="rounded-md bg-white px-3 py-2">
              <p className="text-slate-400">{point.label}</p>
              <p className="font-semibold text-slate-700">${point.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
