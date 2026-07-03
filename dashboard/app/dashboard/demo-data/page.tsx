import { notFound } from "next/navigation";
import { getAdminActor } from "@/lib/auth/requireAdmin";
import ActionCard from "./ActionCard";
import {
  replaceSeedAction,
  keepSeedAction,
  clearSeedAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function DemoDataPage() {
  const actor = await getAdminActor();
  if (!actor) notFound();

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
        <ActionCard
          kind="replace"
          title="Replace demo data"
          description="Wipe existing demo rows, then generate a fresh reproducible dataset (3 stores × 92 days of orders, inventory, and FX)."
          confirmLabel="Replace all demo data"
          buttonLabel="Replace"
          buttonTone="primary"
          action={replaceSeedAction}
        />
        <ActionCard
          kind="keep"
          title="Add demo data (keep existing)"
          description="Append an additional batch of orders and inventory activity. Existing demo rows are preserved. Each click generates a different batch."
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
