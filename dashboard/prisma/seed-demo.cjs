/**
 * Demo seed for the dashboard. See docs/superpowers/specs/2026-07-01-demo-seed-script-design.md.
 *
 * Usage:
 *   node prisma/seed-demo.cjs           # clear + reseed (default)
 *   node prisma/seed-demo.cjs --clear   # wipe demo rows only
 *   node prisma/seed-demo.cjs --keep    # additive batch, no clear, no corrective
 *
 * Env:
 *   DATABASE_URL          Postgres connection (required)
 *   SEED_OWNER_EMAIL      Owner user email; falls back to first User row
 *   SEED_RANDOM_SEED      PRNG seed string (default "react-dashboard-demo")
 */

require("dotenv").config({ path: ".env" });

// ---------- PRNG (deterministic, seeded) -------------------------------------

/**
 * xfnv1a: string -> 32-bit unsigned integer seed.
 * Cheap FNV-1a variant good enough to distribute string seeds across mulberry32.
 */
function xfnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * mulberry32: seeded PRNG. Returns a function () => float in [0, 1).
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Random-selection helpers ----------------------------------------

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function weightedPick(rng, items, weights) {
  if (items.length !== weights.length) {
    throw new Error("weightedPick: items/weights length mismatch");
  }
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) {
    throw new Error("weightedPick: total weight must be > 0");
  }
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1]; // float fallback
}

/** Standard normal via Box-Muller. */
function gaussian(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * chunked(arr, size, asyncFn): call asyncFn(chunk) sequentially for each
 * consecutive slice of `size` elements. Sequential (not parallel) so we do not
 * blow up the Postgres connection pool during bulk inserts.
 */
async function chunked(arr, size, fn) {
  for (let i = 0; i < arr.length; i += size) {
    await fn(arr.slice(i, i + size));
  }
}

// ---------- Module exports (for tests) ---------------------------------------

module.exports = { xfnv1a, mulberry32, randInt, pick, weightedPick, gaussian, chunked };

// Auto-run main() only when invoked directly (not when required by tests).
if (require.main === module) {
  // main() will be added in Task 12; keep a no-op placeholder for now.
  console.error("seed-demo.cjs: main() not yet implemented (Task 12).");
  process.exit(1);
}
