"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const SUPPORTED = ["USD", "EUR", "GBP", "IDR", "JPY"] as const;

export function CurrencySelector({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("currency", e.target.value);
    router.push(`${pathname}?${sp.toString()}`);
  };

  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
      <span className="sr-only">Currency</span>
      <select
        value={value}
        onChange={onChange}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
      >
        {SUPPORTED.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}
