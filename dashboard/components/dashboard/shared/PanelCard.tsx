import { ReactNode } from "react";

type Props = { title: string; subtitle?: string; action?: ReactNode; children: ReactNode };

export function PanelCard({ title, subtitle, action, children }: Props) {
  return (
    <section className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
