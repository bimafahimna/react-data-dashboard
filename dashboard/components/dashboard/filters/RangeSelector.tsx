"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/Button";
import type { Range } from "@/lib/analytics/types";

const RANGES: { value: Range; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function RangeSelector({ value }: { value: Range }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onSelect = useCallback((next: Range) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("range", next);
    router.push(`${pathname}?${sp.toString()}`);
  }, [router, pathname, params]);

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Timeframe">
      {RANGES.map((r) => {
        const active = r.value === value;
        return (
          <Button
            key={r.value}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={active}
            onClick={() => onSelect(r.value)}
            className={active ? "bg-indigo-200 text-slate-900 hover:bg-indigo-300 hover:text-slate-900" : "text-slate-600 hover:bg-white"}
          >
            {r.label}
          </Button>
        );
      })}
    </div>
  );
}
