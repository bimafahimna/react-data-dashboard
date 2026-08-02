import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { Delta } from "@/lib/analytics/types";

type ChipTone = "up" | "down" | "flat";
type ChipVariant = "primary" | "muted";

interface Props {
  label: string;
  value: string;
  isEmpty?: boolean;
  deltaPrev?: Delta;
  deltaYoy?: Delta;
  hint?: string;
  formatNominal?: (n: number) => string;
}

function toneFor(d: Delta): ChipTone {
  if (d.direction === "up") return "up";
  if (d.direction === "down") return "down";
  return "flat";
}

function toneClass(tone: ChipTone, variant: ChipVariant): string {
  if (variant === "muted") {
    if (tone === "up") return "bg-emerald-50 text-emerald-600";
    if (tone === "down") return "bg-rose-50 text-rose-600";
    return "bg-slate-100 text-slate-500";
  }
  if (tone === "up") return "bg-emerald-50 text-emerald-700";
  if (tone === "down") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

function ToneIcon({ tone }: { tone: ChipTone }) {
  if (tone === "up") return <TrendingUp size={12} aria-hidden />;
  if (tone === "down") return <TrendingDown size={12} aria-hidden />;
  return <Minus size={12} aria-hidden />;
}

function formatPct(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "-" : "±";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

function chipText(
  d: Delta,
  { includeNominal, formatNominal }: { includeNominal: boolean; formatNominal?: (n: number) => string },
): string {
  if (d.previous === 0) return "—";
  const pct = formatPct(d.changePct);
  if (!includeNominal || !formatNominal) return pct;
  const nominalSign = d.changeNominal > 0 ? "+" : d.changeNominal < 0 ? "-" : "±";
  return `${pct} · ${nominalSign}${formatNominal(Math.abs(d.changeNominal))}`;
}

function ariaSummary(
  label: string,
  value: string,
  deltaPrev?: Delta,
  deltaYoy?: Delta,
): string {
  const parts = [`${label} ${value}`];
  const describe = (d: Delta, suffix: string) => {
    if (d.previous === 0) return `no comparable ${suffix} data`;
    const dir = d.direction === "up" ? "up" : d.direction === "down" ? "down" : "unchanged";
    return `${dir} ${Math.abs(d.changePct).toFixed(1)} percent versus ${suffix}`;
  };
  if (deltaPrev) parts.push(describe(deltaPrev, "previous period"));
  if (deltaYoy) parts.push(describe(deltaYoy, "last year"));
  return parts.join(", ") + ".";
}

export function KpiTile({
  label,
  value,
  isEmpty,
  deltaPrev,
  deltaYoy,
  hint,
  formatNominal,
}: Props) {
  const showValue = isEmpty ? "—" : value;
  const showChips = !isEmpty;

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-label={showChips ? ariaSummary(label, showValue, deltaPrev, deltaYoy) : `${label} ${showValue}.`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{showValue}</p>
      {hint && <span className="sr-only">{hint}</span>}

      {showChips && deltaPrev && (
        <p
          className={`mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${toneClass(
            toneFor(deltaPrev),
            "primary",
          )}`}
        >
          <ToneIcon tone={toneFor(deltaPrev)} />
          <span>{chipText(deltaPrev, { includeNominal: true, formatNominal })}</span>
          <span className="ml-1 font-normal opacity-75">vs prev</span>
        </p>
      )}

      {showChips && deltaYoy && (
        <p
          className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${toneClass(
            toneFor(deltaYoy),
            "muted",
          )}`}
        >
          <ToneIcon tone={toneFor(deltaYoy)} />
          <span>{chipText(deltaYoy, { includeNominal: false })}</span>
          <span className="ml-1 font-normal opacity-75">vs last year</span>
        </p>
      )}
    </div>
  );
}
