"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Props = {
  from?: string;
  to?: string;
};

const DAY_MS = 86_400_000;

function formatUtcDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Turns a URL-derived ISO-ish string (either "2026-01-15" or
 * "2026-01-15T00:00:00.000Z") into the "YYYY-MM-DD" form that
 * `<input type="date">` expects. Returns "" when the input is
 * missing or unparseable.
 */
function toInputValue(raw: string | undefined): string {
  if (!raw) return "";
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return "";
  return formatUtcDate(new Date(t));
}

/**
 * The rest of the analytics stack treats `to` as an exclusive upper bound
 * (midnight of the day *after* the last included day), matching the preset
 * ranges. Users of the date picker, however, expect to type the *last*
 * included day. `encodeTo` bridges the two: given "2026-01-20" (the day the
 * user wants included), it emits "2026-01-21" for the URL.
 */
function encodeTo(inputYmd: string): string {
  const t = Date.parse(inputYmd);
  if (Number.isNaN(t)) return inputYmd;
  return formatUtcDate(new Date(t + DAY_MS));
}

/** Inverse of `encodeTo`: subtracts one day for display. */
function decodeTo(raw: string | undefined): string {
  if (!raw) return "";
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return "";
  return formatUtcDate(new Date(t - DAY_MS));
}

export function DateRangeSelector({ from, to }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [fromValue, setFromValue] = useState<string>(() => toInputValue(from));
  const [toValue, setToValue] = useState<string>(() => decodeTo(to));

  // Keep local state in sync with URL changes driven by other filters.
  useEffect(() => {
    setFromValue(toInputValue(from));
    setToValue(decodeTo(to));
  }, [from, to]);

  const push = useCallback((nextFrom: string, nextTo: string) => {
    const sp = new URLSearchParams(params.toString());
    if (nextFrom && nextTo) {
      sp.set("from", nextFrom);
      sp.set("to", encodeTo(nextTo));
    } else {
      sp.delete("from");
      sp.delete("to");
    }
    router.push(`${pathname}?${sp.toString()}`);
  }, [router, pathname, params]);

  const onFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setFromValue(next);
    if (next && toValue && next <= toValue) push(next, toValue);
  };

  const onToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setToValue(next);
    if (fromValue && next && fromValue <= next) push(fromValue, next);
  };

  const onClear = () => {
    setFromValue("");
    setToValue("");
    push("", "");
  };

  const isActive = Boolean(fromValue && toValue && fromValue <= toValue);
  const isInvalid =
    Boolean(fromValue && toValue) && !(fromValue <= toValue);

  const inputClass =
    "rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 " +
    "focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 " +
    (isInvalid ? "border-rose-300 focus:border-rose-400 focus:ring-rose-200" : "");

  return (
    <div
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1"
      role="group"
      aria-label="Custom date range"
    >
      <label className="inline-flex items-center gap-1 text-xs text-slate-500">
        <span className="sr-only">From</span>
        <input
          type="date"
          value={fromValue}
          max={toValue || undefined}
          onChange={onFromChange}
          className={inputClass}
          aria-label="From date"
        />
      </label>
      <span aria-hidden="true" className="text-xs text-slate-400">–</span>
      <label className="inline-flex items-center gap-1 text-xs text-slate-500">
        <span className="sr-only">To</span>
        <input
          type="date"
          value={toValue}
          min={fromValue || undefined}
          onChange={onToChange}
          className={inputClass}
          aria-label="To date"
        />
      </label>
      {isActive ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-700"
          aria-label="Clear date range"
        >
          Clear
        </button>
      ) : null}
      {isInvalid ? (
        <span className="text-xs text-rose-600" role="alert">
          From must be on or before To
        </span>
      ) : null}
    </div>
  );
}
