"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[dashboard] error:", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 md:px-6">
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h1 className="text-lg font-semibold text-rose-900">Couldn&apos;t load the dashboard</h1>
        <p className="mt-1 text-sm text-rose-700">Something went wrong while fetching analytics. You can try again.</p>
        <div className="mt-4">
          <Button type="button" variant="ghost" onClick={() => reset()}>Retry</Button>
        </div>
      </div>
    </main>
  );
}
