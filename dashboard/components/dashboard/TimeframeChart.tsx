"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";

type Timeframe = "daily" | "weekly" | "monthly";

interface DailyRecord {
  date: Date;
  value: number;
}

interface ChartPoint {
  label: string;
  value: number;
}

interface ChartCoord extends ChartPoint {
  x: number;
  y: number;
}

const TIMEFRAME_ORDER: Timeframe[] = ["daily", "weekly", "monthly"];

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function generateRawDailyData(days: number): DailyRecord[] {
  const now = new Date(Date.UTC(2026, 3, 29));
  const records: DailyRecord[] = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);

    const day = date.getDate();
    const seasonal = Math.sin((day / 31) * Math.PI) * 20;
    const trend = (days - i) * 0.45;
    const noise = ((day * 13) % 17) - 8;

    records.push({
      date,
      value: Math.max(24, Math.round(70 + seasonal + trend + noise)),
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

function aggregateData(records: DailyRecord[], timeframe: Timeframe): ChartPoint[] {
  if (timeframe === "daily") {
    return records.slice(-7).map((record) => ({
      label: formatDayLabel(record.date),
      value: record.value,
    }));
  }

  if (timeframe === "weekly") {
    const groups = new Map<string, { label: string; total: number; count: number; time: number }>();

    for (const record of records) {
      const weekStart = getWeekStart(record.date);
      const key = weekStart.toISOString().slice(0, 10);
      const existing = groups.get(key);

      if (existing) {
        existing.total += record.value;
        existing.count += 1;
      } else {
        groups.set(key, {
          label: formatWeekLabel(weekStart),
          total: record.value,
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
        value: Math.round(item.total / item.count),
      }));
  }

  const months = new Map<string, { label: string; total: number; count: number; time: number }>();

  for (const record of records) {
    const monthDate = new Date(record.date.getFullYear(), record.date.getMonth(), 1);
    const key = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
    const existing = months.get(key);

    if (existing) {
      existing.total += record.value;
      existing.count += 1;
    } else {
      months.set(key, {
        label: formatMonthLabel(monthDate),
        total: record.value,
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
      value: Math.round(item.total / item.count),
    }));
}

function buildInsight(points: ChartPoint[]): string {
  if (points.length < 2) return "Not enough data to calculate a trend.";

  const first = points[0].value;
  const last = points[points.length - 1].value;
  const peak = points.reduce((max, point) => (point.value > max.value ? point : max), points[0]);
  const trough = points.reduce((min, point) => (point.value < min.value ? point : min), points[0]);
  const changePct = ((last - first) / first) * 100;
  const direction = changePct >= 0 ? "up" : "down";

  return `Trend is ${direction} ${Math.abs(changePct).toFixed(1)}% in this period. Peak at ${peak.value} (${peak.label}) and lowest at ${trough.value} (${trough.label}).`;
}

function buildChartGeometry(points: ChartPoint[], width: number, height: number, padX = 10, padY = 18) {
  if (points.length === 0) {
    return {
      path: "",
      areaPath: "",
      coords: [] as ChartCoord[],
    };
  }

  const max = Math.max(...points.map((point) => point.value));
  const min = Math.min(...points.map((point) => point.value));
  const span = Math.max(1, max - min);
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

  const areaPath = `${path} L ${(width - padX).toFixed(2)} ${(height - padY).toFixed(2)} L ${padX.toFixed(2)} ${(height - padY).toFixed(2)} Z`;

  return { path, areaPath, coords };
}

const RAW_DATA = generateRawDailyData(120);

export default function TimeframeChart() {
  const [timeframe, setTimeframe] = useState<Timeframe>("daily");
  const [hoveredPoint, setHoveredPoint] = useState<ChartCoord | null>(null);

  const chartData = useMemo(() => aggregateData(RAW_DATA, timeframe), [timeframe]);
  const insight = useMemo(() => buildInsight(chartData), [chartData]);
  const chartGeometry = useMemo(() => buildChartGeometry(chartData, 760, 280), [chartData]);

  return (
    <section className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Performance Overview</h2>
          <p className="mt-1 text-sm text-slate-500">{insight}</p>
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
              <p className="text-[11px] text-slate-400">{hoveredPoint.label}</p>
              <p className="text-sm font-semibold text-slate-800">{hoveredPoint.value}</p>
            </div>
          )}

          <svg
            viewBox="0 0 760 280"
            role="img"
            aria-label="Trend chart"
            className="h-[280px] w-full"
            onMouseLeave={() => setHoveredPoint(null)}
          >
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>

            <path
              d={chartGeometry.path}
              fill="none"
              stroke="#6366f1"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path d={chartGeometry.areaPath} fill="url(#trendFill)" />

            {chartGeometry.coords.map((point) => (
              <g key={`${point.label}-${point.value}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={8}
                  fill="transparent"
                  onMouseEnter={() => setHoveredPoint(point)}
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={hoveredPoint?.label === point.label ? 4.5 : 3.5}
                  fill={hoveredPoint?.label === point.label ? "#4f46e5" : "#6366f1"}
                  stroke="#fff"
                  strokeWidth="1.5"
                />
              </g>
            ))}
          </svg>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500 md:grid-cols-4">
          {chartData.slice(-4).map((point) => (
            <div key={point.label} className="rounded-md bg-white px-3 py-2">
              <p className="text-slate-400">{point.label}</p>
              <p className="font-semibold text-slate-700">{point.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
