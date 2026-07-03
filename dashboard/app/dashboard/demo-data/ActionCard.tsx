"use client";

import { useActionState, useEffect, useState } from "react";
import type { ActionResult, SeedSummary } from "./types";

type Props = {
  kind: "replace" | "keep" | "clear";
  title: string;
  description: string;
  confirmLabel: string;
  buttonLabel: string;
  buttonTone: "primary" | "danger";
  action: (prev: ActionResult | null) => Promise<ActionResult>;
};

const toneClasses = {
  primary:
    "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 text-white",
  danger:
    "bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white",
} as const;

function formatCleared(c: NonNullable<SeedSummary["cleared"]>): string {
  return (
    `${c.stores} stores, ${c.products} products, ${c.customers} customers, ` +
    `${c.orders.toLocaleString()} orders, ${c.inventoryMovements.toLocaleString()} inventory movements, ` +
    `${c.fxRates.toLocaleString()} FX rates`
  );
}

function formatInserted(i: NonNullable<SeedSummary["inserted"]>): string {
  return (
    `${i.stores} stores, ${i.products} products, ${i.customers} customers, ` +
    `${i.orders.toLocaleString()} orders, ${i.inventoryMovements.toLocaleString()} inventory movements, ` +
    `${i.fxRates.toLocaleString()} FX rates`
  );
}

function SummaryBlock({ summary }: { summary: SeedSummary }) {
  const secs = (summary.durationMs / 1000).toFixed(1);
  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <p className="font-semibold">Done in {secs}s.</p>
      {summary.cleared && (
        <p className="mt-1">
          <span className="font-medium">Cleared:</span> {formatCleared(summary.cleared)}.
        </p>
      )}
      {summary.inserted && summary.mode !== "keep" && (
        <p className="mt-1">
          <span className="font-medium">Inserted:</span> {formatInserted(summary.inserted)}.
        </p>
      )}
      {summary.inserted && summary.mode === "keep" && (
        <>
          <p className="mt-1">
            <span className="font-medium">This batch:</span>{" "}
            {summary.inserted.orders.toLocaleString()} orders,{" "}
            {summary.inserted.inventoryMovements.toLocaleString()} inventory movements.
          </p>
          <p className="mt-0.5 text-xs text-emerald-800">
            (Stores, products, customers, and FX rows were skipped as duplicates by design.)
          </p>
        </>
      )}
      {summary.mode !== "clear" && (
        <p className="mt-1 text-xs text-emerald-800">
          Seed: <code className="rounded bg-emerald-100 px-1 py-0.5">{summary.seedString}</code>
        </p>
      )}
    </div>
  );
}

export default function ActionCard({
  kind,
  title,
  description,
  confirmLabel,
  buttonLabel,
  buttonTone,
  action,
}: Props) {
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(
    action as unknown as (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>,
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Close the confirm dialog once the form has actually been submitted
  // (i.e. React flipped isPending to true). Doing this from the submit button's
  // onClick would unmount the <form> before React handled the submission and
  // trigger "Form submission canceled because the form is not connected".
  useEffect(() => {
    if (isPending) setConfirmOpen(false);
  }, [isPending]);

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
      data-kind={kind}
    >
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${toneClasses[buttonTone]}`}
        >
          {isPending ? "Running…" : buttonLabel}
        </button>
      </div>

      {isPending && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Running… the dashboard will refresh with new data when this completes.
        </div>
      )}

      {!isPending && state && state.ok && <SummaryBlock summary={state.summary} />}

      {!isPending && state && !state.ok && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">Failed.</p>
          <p className="mt-1">{state.message}</p>
        </div>
      )}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`confirm-${kind}-title`}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3
              id={`confirm-${kind}-title`}
              className="text-lg font-semibold text-slate-900"
            >
              {confirmLabel}?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              This action runs against the current database and cannot be undone through this UI.
              Are you sure?
            </p>
            <form action={formAction} className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-offset-1 ${toneClasses[buttonTone]}`}
              >
                {confirmLabel}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
