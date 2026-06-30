export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-xl bg-slate-100"
      style={{ height }}
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <span className="sr-only">Loading chart…</span>
    </div>
  );
}
