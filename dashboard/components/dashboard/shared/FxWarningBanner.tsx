type Props = { excludedCount: number };

export function FxWarningBanner({ excludedCount }: Props) {
  if (excludedCount <= 0) return null;
  return (
    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
      {excludedCount} order{excludedCount === 1 ? "" : "s"} excluded from totals — missing FX rate.
    </div>
  );
}
