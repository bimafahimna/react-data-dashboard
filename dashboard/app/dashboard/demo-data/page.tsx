import { notFound } from "next/navigation";
import { getAdminActor } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma";
import ActionCard from "./ActionCard";
import {
  replaceSeedAction,
  keepSeedAction,
  clearSeedAction,
} from "./actions";
import type { SeedCapacity } from "./types";

const seedMod = require("../../../prisma/seed-demo.cjs") as {
  projectedBatchRows: () => number;
  resolveMaxTotalRows: (override?: string) => number;
  countDemoRows: (
    prisma: typeof import("@/lib/prisma").prisma,
  ) => Promise<{ total: number; byTable: Record<string, number> }>;
};

export const dynamic = "force-dynamic";

async function loadCapacity(): Promise<SeedCapacity> {
  const projected = seedMod.projectedBatchRows();
  const max = seedMod.resolveMaxTotalRows();
  const { total } = await seedMod.countDemoRows(prisma);
  return {
    demoRowsBefore: total,
    demoRowsAfter: total, // no run has happened yet on this page load
    projectedBatchRows: projected,
    maxTotalRows: Number.isFinite(max) ? max : null,
  };
}

function CapacityCard({ cap }: { cap: SeedCapacity }) {
  const capLabel = cap.maxTotalRows == null ? "unlimited" : cap.maxTotalRows.toLocaleString();
  const headroom =
    cap.maxTotalRows == null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, cap.maxTotalRows - cap.demoRowsBefore);
  const pct =
    cap.maxTotalRows == null || cap.maxTotalRows === 0
      ? 0
      : Math.min(100, Math.round((cap.demoRowsBefore / cap.maxTotalRows) * 100));
  const wouldFit = headroom >= cap.projectedBatchRows;
  const barTone = pct >= 90 ? "bg-rose-500" : pct >= 66 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Demo footprint</h2>
        <p className="text-xs text-slate-500">Counts every demo-tagged row across the DB.</p>
      </div>
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold text-slate-900">
            {cap.demoRowsBefore.toLocaleString()}
            <span className="ml-1 text-slate-400">/ {capLabel} rows</span>
          </span>
          <span className="text-xs text-slate-500">{pct}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full ${barTone}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Next <em>Add batch</em> is projected at ~
        <span className="font-medium text-slate-900">
          {cap.projectedBatchRows.toLocaleString()}
        </span>{" "}
        rows.{" "}
        {wouldFit ? (
          <span className="text-emerald-700">
            Room for {Number.isFinite(headroom) ? headroom.toLocaleString() : "∞"} more.
          </span>
        ) : (
          <span className="text-rose-700">
            Over the cap — <em>Add batch</em> will be rejected until you <em>Remove all</em> or
            raise <code>SEED_MAX_TOTAL_ROWS</code>.
          </span>
        )}
      </p>
      <p className="mt-2 text-xs text-slate-400">
        Cap defaults to 3 × one batch. Override with <code>SEED_MAX_TOTAL_ROWS</code> (positive
        integer, or <code>unlimited</code>).
      </p>
    </section>
  );
}

export default async function DemoDataPage() {
  const actor = await getAdminActor();
  if (!actor) notFound();

  const capacity = await loadCapacity();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Demo Data</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage the demo dataset used by the dashboard. These actions only
          affect rows tagged as demo data; your own records are never touched.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Signed in as admin: <code>{actor.email}</code>
        </p>
      </div>

      <div className="space-y-4">
        <CapacityCard cap={capacity} />

        <ActionCard
          kind="replace"
          title="Replace demo data"
          description="Wipe existing demo rows, then generate a fresh reproducible dataset (3 stores × one full calendar year of orders, inventory, and FX, spread from January through December) sized to exercise year-over-year KPIs and the per-store breakdown."
          confirmLabel="Replace all demo data"
          buttonLabel="Replace"
          buttonTone="primary"
          action={replaceSeedAction}
        />
        <ActionCard
          kind="keep"
          title="Add demo data (keep existing)"
          description="Append an additional batch of orders and inventory activity. Existing demo rows are preserved. Each click generates a different batch. Blocked once the total demo footprint would exceed the cap."
          confirmLabel="Add another demo batch"
          buttonLabel="Add batch"
          buttonTone="primary"
          action={keepSeedAction}
        />
        <ActionCard
          kind="clear"
          title="Remove all demo data"
          description="Delete every demo-tagged row (stores, products, customers, orders, inventory, FX). User data is not touched."
          confirmLabel="Delete all demo data"
          buttonLabel="Remove all"
          buttonTone="danger"
          action={clearSeedAction}
        />
      </div>
    </main>
  );
}
