"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Store = { id: number; name: string };

export function StoreSelector({ stores, value }: { stores: Store[]; value?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sp = new URLSearchParams(params.toString());
    if (e.target.value === "all") sp.delete("storeId");
    else sp.set("storeId", e.target.value);
    router.push(`${pathname}?${sp.toString()}`);
  };

  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
      <span className="sr-only">Store</span>
      <select
        value={value ?? "all"}
        onChange={onChange}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
      >
        <option value="all">All stores</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </label>
  );
}
