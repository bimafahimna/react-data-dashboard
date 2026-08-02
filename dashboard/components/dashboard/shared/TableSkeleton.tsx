interface Props {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 7, columns = 8 }: Props) {
  return (
    <div
      className="w-full animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <span className="sr-only">Loading table…</span>
      <div className="mb-3 h-4 w-40 rounded bg-slate-200" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((__, c) => (
              <div key={c} className="h-4 rounded bg-slate-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
