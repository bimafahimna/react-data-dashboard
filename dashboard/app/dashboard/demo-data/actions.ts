"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma";
import type { ActionResult, SeedMode, SeedSummary } from "./types";

// The seed script is CommonJS; Next.js Node runtime handles the interop.
const { runSeedDemo } = require("../../../prisma/seed-demo.cjs") as {
  runSeedDemo: (opts: {
    prisma: typeof prisma;
    mode: SeedMode;
    seedSuffix?: string;
  }) => Promise<SeedSummary>;
};

async function runOrFail(
  mode: SeedMode,
  seedSuffix?: string,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: "Forbidden — admin role required." };
  }

  try {
    const summary = await runSeedDemo({ prisma, mode, seedSuffix });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/data");
    revalidatePath("/dashboard/demo-data");
    return { ok: true, summary };
  } catch (err) {
    console.error(`[demo-data] ${mode} failed:`, err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function replaceSeedAction(
  _prev: ActionResult | null,
): Promise<ActionResult> {
  return runOrFail("reseed");
}

export async function keepSeedAction(
  _prev: ActionResult | null,
): Promise<ActionResult> {
  return runOrFail("keep", String(Date.now()));
}

export async function clearSeedAction(
  _prev: ActionResult | null,
): Promise<ActionResult> {
  return runOrFail("clear");
}
