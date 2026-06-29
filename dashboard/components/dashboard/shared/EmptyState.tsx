import { ReactNode } from "react";

type Props = { title: string; hint?: string; icon?: ReactNode };

export function EmptyState({ title, hint, icon }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      {icon && <div className="mb-2 text-slate-400">{icon}</div>}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
