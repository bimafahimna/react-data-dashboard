# Demo Seed Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `prisma/seed-demo.cjs`, a flag-driven, deterministic, env-driven seed that fills any Postgres `DATABASE_URL` with 3 stores × ~3 months of orders, engineered inventory profiles for top-products and low-stock alerts, and a full daily FX matrix across 5 currencies.

**Architecture:** Single CommonJS file at `prisma/seed-demo.cjs` mirroring the existing `prisma/seed-smoke.cjs` pattern (dotenv + `PrismaPg` adapter + `PrismaClient`). All demo rows are tagged (SKU prefix, email suffix, store name prefix, movement note, FX midnight-UTC `asOf`) so `--clear` is surgical and never touches user data or the smoke seed. Inventory profile invariants are guaranteed by a final corrective movement per product; sanity assertions inside a single `$transaction` roll back on any mismatch.

**Tech Stack:** Node.js CJS, Prisma 7 (`@prisma/client` + `@prisma/adapter-pg`), PostgreSQL, `dotenv`, `vitest` (for helper unit tests only). All already in `package.json`; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-01-demo-seed-script-design.md`

**Working directory for all commands:** `react-data-dashboard/dashboard/`

---

## File Structure

| File | Purpose | Action |
|---|---|---|
| `prisma/seed-demo.cjs` | The seed script — constants, PRNG, generators, clear phase, seed phase, `main()`. Exports pure helpers when required as a module so unit tests can import them; auto-runs `main()` only when invoked as `node prisma/seed-demo.cjs`. | Create |
| `prisma/__tests__/seed-demo-helpers.test.cjs` | Vitest tests for the pure helpers (PRNG determinism, `weightedPick` distribution, `chunked`, invariant checker). No DB access. | Create |
| `package.json` | Add `seed:demo` and `seed:demo:clear` scripts. | Modify |

All tasks are self-contained. Each task ends with running the test suite and a commit.

---

## Task 1: Scaffold file + PRNG helpers + tests

**Files:**
- Create: `react-data-dashboard/dashboard/prisma/seed-demo.cjs`
- Create: `react-data-dashboard/dashboard/prisma/__tests__/seed-demo-helpers.test.cjs`

- [ ] **Step 1: Write the failing test**

Create `prisma/__tests__/seed-demo-helpers.test.cjs`:

```javascript
const { describe, it, expect } = require("vitest");
const { xfnv1a, mulberry32 } = require("../seed-demo.cjs");

describe("xfnv1a + mulberry32", () => {
  it("mulberry32 is deterministic for a fixed seed", () => {
    const a = mulberry32(xfnv1a("react-dashboard-demo"));
    const b = mulberry32(xfnv1a("react-dashboard-demo"));
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("mulberry32 produces different sequences for different seeds", () => {
    const a = mulberry32(xfnv1a("seed-A"));
    const b = mulberry32(xfnv1a("seed-B"));
    expect(a()).not.toBe(b());
  });

  it("mulberry32 outputs are in [0, 1)", () => {
    const rng = mulberry32(xfnv1a("bounds"));
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: FAIL — `Cannot find module '../seed-demo.cjs'`.

- [ ] **Step 3: Create minimal `seed-demo.cjs` with PRNG helpers**

Create `prisma/seed-demo.cjs`:

```javascript
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

// ---------- Module exports (for tests) ---------------------------------------

module.exports = { xfnv1a, mulberry32 };

// Auto-run main() only when invoked directly (not when required by tests).
if (require.main === module) {
  // main() will be added in Task 12; keep a no-op placeholder for now.
  console.error("seed-demo.cjs: main() not yet implemented (Task 12).");
  process.exit(1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed-demo.cjs prisma/__tests__/seed-demo-helpers.test.cjs
git commit -m "feat(seed-demo): scaffold script with deterministic PRNG"
```

---

## Task 2: Random-selection helpers + tests

**Files:**
- Modify: `prisma/seed-demo.cjs` (add helpers before `module.exports`)
- Modify: `prisma/__tests__/seed-demo-helpers.test.cjs` (add tests)

- [ ] **Step 1: Add failing tests**

Append to `prisma/__tests__/seed-demo-helpers.test.cjs`:

```javascript
const { randInt, pick, weightedPick, gaussian, chunked } = require("../seed-demo.cjs");

describe("randInt", () => {
  it("returns integers within [min, max] inclusive", () => {
    const rng = mulberry32(xfnv1a("randint"));
    for (let i = 0; i < 500; i++) {
      const v = randInt(rng, 5, 15);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(15);
    }
  });
});

describe("pick", () => {
  it("returns an element from the array", () => {
    const rng = mulberry32(xfnv1a("pick"));
    const arr = ["a", "b", "c"];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(pick(rng, arr));
    }
  });
});

describe("weightedPick", () => {
  it("heavy weight dominates over many draws", () => {
    const rng = mulberry32(xfnv1a("weighted"));
    const items = ["heavy", "light"];
    const weights = [10, 1];
    let heavy = 0;
    for (let i = 0; i < 1000; i++) {
      if (weightedPick(rng, items, weights) === "heavy") heavy++;
    }
    // Expect ~909 heavy; allow slack.
    expect(heavy).toBeGreaterThan(800);
    expect(heavy).toBeLessThan(1000);
  });

  it("throws when total weight is zero", () => {
    const rng = mulberry32(xfnv1a("w0"));
    expect(() => weightedPick(rng, ["a", "b"], [0, 0])).toThrow(/weight/i);
  });
});

describe("gaussian", () => {
  it("has ~mean 0 and stddev ~1 over many draws", () => {
    const rng = mulberry32(xfnv1a("gauss"));
    let sum = 0;
    let sumSq = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const v = gaussian(rng);
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / N;
    const variance = sumSq / N - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.1);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.1);
  });
});

describe("chunked", () => {
  it("splits an array into chunks of the given size", async () => {
    const seen = [];
    await chunked([1, 2, 3, 4, 5], 2, async (chunk) => {
      seen.push(chunk);
    });
    expect(seen).toEqual([[1, 2], [3, 4], [5]]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: FAIL — undefined exports (`randInt`, `pick`, `weightedPick`, `gaussian`, `chunked`).

- [ ] **Step 3: Implement helpers**

In `prisma/seed-demo.cjs`, insert BEFORE the `module.exports` line:

```javascript
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
```

And extend `module.exports` to:

```javascript
module.exports = { xfnv1a, mulberry32, randInt, pick, weightedPick, gaussian, chunked };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: PASS — 8 tests pass (3 from Task 1 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed-demo.cjs prisma/__tests__/seed-demo-helpers.test.cjs
git commit -m "feat(seed-demo): add random-selection helpers with tests"
```

---

## Task 3: Constants and fixture pools

**Files:**
- Modify: `prisma/seed-demo.cjs` (add constants block after PRNG helpers)

- [ ] **Step 1: Add constants block**

In `prisma/seed-demo.cjs`, insert AFTER the `chunked` helper and BEFORE `module.exports`:

```javascript
// ---------- Constants -------------------------------------------------------

const DEMO_TAG = "demo-seed-v1";
const DEMO_TAG_CORRECTIVE = "demo-seed-v1 corrective";
const DEMO_TAG_PREFIX = "demo-seed-v1"; // used with LIKE for --clear

const WINDOW_DAYS = 92;

const DEMO_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "IDR"];

/** Anchor USD-based rates as of "now" (seed run time). Other pairs are derived. */
const USD_ANCHORS = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 157.0,
  IDR: 16200.0,
};

const STORES = [
  { code: "JKT", name: "Demo — Jakarta Flagship", location: "Jakarta", baseCurrency: "IDR", baseOrdersPerDay: 10 },
  { code: "BER", name: "Demo — Berlin Outlet",   location: "Berlin",   baseCurrency: "EUR", baseOrdersPerDay: 7  },
  { code: "NYC", name: "Demo — NYC Showroom",    location: "New York", baseCurrency: "USD", baseOrdersPerDay: 9  },
];

const CATEGORIES = ["Apparel", "Footwear", "Accessories", "Electronics", "Home"];

/** Price bands in the store's base-currency cents. */
const CATEGORY_PRICE_BAND_CENTS = {
  Apparel:     [1500,  8000],
  Footwear:    [3000, 15000],
  Accessories: [ 800,  5000],
  Electronics: [8000, 80000],
  Home:        [2000, 20000],
};

/** 10 product names per category (fixture pool). */
const PRODUCT_NAMES = {
  Apparel:     ["Crewneck Tee", "Linen Shirt", "Oxford Button-Down", "Merino Sweater", "Chino Shorts", "Selvedge Jeans", "Puffer Jacket", "Rain Shell", "Track Pants", "Hooded Sweatshirt"],
  Footwear:    ["Runner 3.0", "Trail Boot", "Canvas Sneaker", "Leather Loafer", "Chelsea Boot", "Suede Derby", "Court Shoe", "Slip-On", "Sandal", "Winter Boot"],
  Accessories: ["Leather Belt", "Wool Beanie", "Silk Scarf", "Aviator Sunglasses", "Bifold Wallet", "Canvas Tote", "Bucket Hat", "Analog Watch", "Card Holder", "Weekender Bag"],
  Electronics: ["Wireless Earbuds", "Bluetooth Speaker", "Smart Bulb", "USB-C Hub", "Portable SSD", "Mechanical Keyboard", "Webcam HD", "Charging Pad", "Noise-Cancel Headphones", "Streaming Stick"],
  Home:        ["Ceramic Mug Set", "Cotton Throw", "Scented Candle", "Bamboo Cutting Board", "French Press", "Linen Napkins", "Desk Lamp", "Wall Clock", "Cast-Iron Skillet", "Bath Towel Set"],
};

const PRODUCT_PROFILE = {
  TOP:      { perStore: 2, initial: [200, 300], restockEveryDays: 14, restockAmount: [50, 100] },
  HEALTHY:  { perStore: 5, initial: [ 80, 120], restockEveryDays: 21, restockAmount: [30,  60] },
  LOW:      { perStore: 2, initial: [ 20,  30], restockEveryDays: null, restockAmount: null },
  CRITICAL: { perStore: 1, initial: [ 10,  15], restockEveryDays: null, restockAmount: null },
};

const ORDER_STATUS_MIX = [
  { status: "PAID",      weight: 92 },
  { status: "PENDING",   weight: 5  },
  { status: "REFUNDED",  weight: 2  },
  { status: "CANCELLED", weight: 1  },
];

/** 90 total customers; first 25 are the "repeat" pool. */
const NUM_CUSTOMERS = 90;
const REPEAT_POOL_SIZE = 25;
const REPEAT_PROBABILITY = 0.7;

const CUSTOMER_FIRST_NAMES = [
  "Alex", "Sam", "Jordan", "Taylor", "Casey", "Morgan", "Riley", "Avery", "Cameron", "Rowan",
  "Quinn", "Jamie", "Reese", "Emerson", "Skyler", "Hayden", "Parker", "Drew", "Kai", "Nico",
  "Sasha", "Kendall", "Ari", "Elliot", "Sage", "Blake", "Charlie", "Devon", "Finley", "Harper",
];
const CUSTOMER_LAST_NAMES = [
  "Nguyen", "García", "Kim", "Patel", "Silva", "Cohen", "Okafor", "Yamamoto", "Andersson",
  "Rossi", "Müller", "Dubois", "Ivanov", "Sato", "Rahman", "O'Neill", "Costa", "Fischer",
];
```

- [ ] **Step 2: Sanity-check with a syntax load**

Run: `node -e "require('./prisma/seed-demo.cjs')"`
Expected: prints the "main() not yet implemented" line then exits 1 — but ONLY when run directly. When required, exports load cleanly with no error.

Actually run: `node -e "const m = require('./prisma/seed-demo.cjs'); console.log(Object.keys(m).sort().join(','))"`
Expected output: `chunked,gaussian,mulberry32,pick,randInt,weightedPick,xfnv1a`

- [ ] **Step 3: Verify tests still pass**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: PASS — all 8 tests still pass (constants are additive).

- [ ] **Step 4: Commit**

```bash
git add prisma/seed-demo.cjs
git commit -m "feat(seed-demo): add data constants and fixture pools"
```

---

## Task 4: Argv/env parsing + owner resolution + Prisma client bootstrap

**Files:**
- Modify: `prisma/seed-demo.cjs` (add `parseArgs`, `resolveOwner`, and update the auto-run guard)

- [ ] **Step 1: Add `parseArgs` and `resolveOwner`**

In `prisma/seed-demo.cjs`, insert AFTER the constants block:

```javascript
// ---------- Argv / env parsing ----------------------------------------------

function parseArgs(argv) {
  const flags = { clear: false, keep: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--clear") flags.clear = true;
    else if (arg === "--keep") flags.keep = true;
    else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (flags.clear && flags.keep) {
    throw new Error("--clear and --keep are mutually exclusive.");
  }
  return flags;
}

// ---------- Owner resolution ------------------------------------------------

async function resolveOwner(prisma) {
  const email = process.env.SEED_OWNER_EMAIL;
  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error(
        `SEED_OWNER_EMAIL=${email} not found. Sign up at http://localhost:3000/signup first, ` +
          `or unset SEED_OWNER_EMAIL to fall back to the first user.`
      );
    }
    return user;
  }
  const user = await prisma.user.findFirst({ orderBy: { accountId: "asc" } });
  if (!user) {
    throw new Error(
      "No User row found. Sign up at http://localhost:3000/signup first, " +
        "or set SEED_OWNER_EMAIL to an existing account."
    );
  }
  return user;
}
```

Extend `module.exports`:

```javascript
module.exports = {
  xfnv1a, mulberry32, randInt, pick, weightedPick, gaussian, chunked,
  parseArgs,
};
```

- [ ] **Step 2: Add unit tests for `parseArgs`**

Append to `prisma/__tests__/seed-demo-helpers.test.cjs`:

```javascript
const { parseArgs } = require("../seed-demo.cjs");

describe("parseArgs", () => {
  const base = ["node", "seed-demo.cjs"];
  it("default: no flags", () => {
    expect(parseArgs(base)).toEqual({ clear: false, keep: false });
  });
  it("--clear sets clear", () => {
    expect(parseArgs([...base, "--clear"])).toEqual({ clear: true, keep: false });
  });
  it("--keep sets keep", () => {
    expect(parseArgs([...base, "--keep"])).toEqual({ clear: false, keep: true });
  });
  it("rejects unknown flags", () => {
    expect(() => parseArgs([...base, "--nope"])).toThrow(/Unknown argument/);
  });
  it("rejects --clear + --keep together", () => {
    expect(() => parseArgs([...base, "--clear", "--keep"])).toThrow(/mutually exclusive/);
  });
});
```

- [ ] **Step 3: Update the auto-run guard to actually construct Prisma client**

Replace the `if (require.main === module) { ... }` block at the bottom of `prisma/seed-demo.cjs` with:

```javascript
if (require.main === module) {
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { PrismaClient } = require("../generated/prisma");
  const flags = parseArgs(process.argv);
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  main(prisma, flags)
    .catch((e) => {
      console.error(e.message || e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

// main() is defined in Task 12. Provide a placeholder so the file still loads.
async function main(prisma, flags) {
  const owner = await resolveOwner(prisma);
  console.log(`Owner: ${owner.email} (accountId=${owner.accountId})`);
  console.log(`Flags: ${JSON.stringify(flags)}`);
  console.error("seed-demo.cjs: main() not yet implemented (Task 12).");
  process.exit(1);
}
```

- [ ] **Step 4: Run tests to verify**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: PASS — 13 tests (8 + 5 new).

- [ ] **Step 5: Smoke-check owner resolution against a real DB (optional but recommended)**

Run: `node prisma/seed-demo.cjs`
Expected: prints `Owner: <email> (accountId=N)` then exits 1 with the "not yet implemented" message. Verifies env loading + PrismaPg + DATABASE_URL wiring.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed-demo.cjs prisma/__tests__/seed-demo-helpers.test.cjs
git commit -m "feat(seed-demo): argv/env parsing and owner resolution"
```

---

## Task 5: Clear phase

**Files:**
- Modify: `prisma/seed-demo.cjs` (add `clearDemo` function)

Deletes all demo-tagged rows in FK-safe order. FX rows are cleared with a raw SQL query keyed on `EXTRACT(EPOCH FROM asOf) % 86400 = 0` (midnight-UTC only) so the smoke seed's sub-day FX row survives.

- [ ] **Step 1: Add `clearDemo`**

Insert AFTER `resolveOwner` in `prisma/seed-demo.cjs`:

```javascript
// ---------- Clear phase -----------------------------------------------------

/**
 * Deletes all rows this script has ever created. Never touches User rows,
 * Categories (shared/idempotent), or the smoke seed's data.
 *
 * Must run inside a transaction OR as top-level Prisma calls; we call it at
 * the top level (outside $transaction) because a single DELETE ... IN (subquery)
 * plan for `orderItem` needs the child->parent order committed step by step.
 */
async function clearDemo(prisma) {
  const t0 = Date.now();
  const counts = {};

  counts.movements = (
    await prisma.inventoryMovement.deleteMany({
      where: { note: { startsWith: DEMO_TAG_PREFIX } },
    })
  ).count;

  // orderItem cascades on Order delete (schema: onDelete: Cascade), so we can
  // let Order deletion handle items. But we count them first for the summary.
  counts.orderItems = await prisma.orderItem.count({
    where: { order: { customer: { email: { endsWith: "@demo.seed" } } } },
  });

  counts.orders = (
    await prisma.order.deleteMany({
      where: { customer: { email: { endsWith: "@demo.seed" } } },
    })
  ).count;

  counts.products = (
    await prisma.product.deleteMany({ where: { sku: { startsWith: "DEMO-" } } })
  ).count;

  counts.customers = (
    await prisma.customer.deleteMany({ where: { email: { endsWith: "@demo.seed" } } })
  ).count;

  counts.stores = (
    await prisma.store.deleteMany({ where: { name: { startsWith: "Demo — " } } })
  ).count;

  // FX: raw SQL because Prisma cannot express the midnight-UTC predicate.
  // "asOf" is a timestamptz; epoch % 86400 == 0 iff it is exact UTC midnight.
  // We use Prisma.join to build a safe IN-list rather than relying on
  // tagged-template array-to-Postgres-array conversion.
  const { Prisma } = require("../generated/prisma");
  const ccyList = Prisma.join(DEMO_CURRENCIES);
  const fxResult = await prisma.$executeRaw`
    DELETE FROM "FxRate"
    WHERE "baseCurrency" IN (${ccyList})
      AND "quoteCurrency" IN (${ccyList})
      AND CAST(EXTRACT(EPOCH FROM "asOf") AS BIGINT) % 86400 = 0
  `;
  counts.fxRates = fxResult;

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `Cleared demo rows (${elapsed}s): ` +
      `movements=${counts.movements}, orderItems=${counts.orderItems}, ` +
      `orders=${counts.orders}, products=${counts.products}, ` +
      `customers=${counts.customers}, stores=${counts.stores}, fxRates=${counts.fxRates}`
  );
  return counts;
}
```

- [ ] **Step 2: Wire `--clear` into the placeholder `main()`**

Update the placeholder `main()` at the bottom of the file to:

```javascript
async function main(prisma, flags) {
  const owner = await resolveOwner(prisma);
  console.log(`Owner: ${owner.email} (accountId=${owner.accountId})`);

  if (!flags.keep) {
    await clearDemo(prisma);
  }
  if (flags.clear) {
    console.log("Clear-only mode: done.");
    return;
  }

  console.error("seed-demo.cjs: seed phase not yet implemented (Task 12).");
  process.exit(1);
}
```

- [ ] **Step 3: Manual smoke test**

Assumes a working `.env` with `DATABASE_URL` and at least one `User`.

Run: `node prisma/seed-demo.cjs --clear`
Expected: on a fresh DB, prints all zero counts. If the smoke seed has been run, its rows are NOT touched (smoke uses `Smoke Test Store` name, `SMOKE-` sku prefix, `smoke@example.com` email). Verify with:

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"Store\" WHERE name LIKE 'Smoke%';"
```
Expected: unchanged from before the run.

- [ ] **Step 4: Ensure existing tests still pass**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed-demo.cjs
git commit -m "feat(seed-demo): clear phase with midnight-UTC FX filter"
```

---

## Task 6: Category + Store + Product seeding

**Files:**
- Modify: `prisma/seed-demo.cjs` (add `seedCategories`, `seedStores`, `buildProducts`, `seedProducts`)

- [ ] **Step 1: Add category + store seeders**

Insert AFTER `clearDemo`:

```javascript
// ---------- Category + Store seeding ----------------------------------------

async function seedCategories(prisma) {
  const rows = await Promise.all(
    CATEGORIES.map((name) =>
      prisma.category.upsert({ where: { name }, create: { name }, update: {} })
    )
  );
  const byName = new Map(rows.map((c) => [c.name, c]));
  return byName;
}

async function seedStores(prisma, ownerAccountId) {
  const created = [];
  for (const s of STORES) {
    // No unique on (name, ownerId); use find-or-create.
    let store = await prisma.store.findFirst({
      where: { name: s.name, ownerId: ownerAccountId },
    });
    if (!store) {
      store = await prisma.store.create({
        data: {
          name: s.name,
          location: s.location,
          baseCurrency: s.baseCurrency,
          ownerId: ownerAccountId,
        },
      });
    }
    created.push({ ...s, id: store.id });
  }
  return created; // each element has: { code, name, location, baseCurrency, baseOrdersPerDay, id }
}
```

- [ ] **Step 2: Add product generator + seeder**

Continue in the same file:

```javascript
// ---------- Product generation ----------------------------------------------

/**
 * For a given store, produce 10 products split by profile:
 *   2 TOP, 5 HEALTHY, 2 LOW, 1 CRITICAL.
 * Each product is assigned a category (round-robin across CATEGORIES) and a
 * price randomly sampled from the category's cents band.
 */
function buildProducts(rng, store, categoriesByName) {
  const products = [];
  let nnn = 0;

  const profileList = [
    ...Array(PRODUCT_PROFILE.TOP.perStore).fill("TOP"),
    ...Array(PRODUCT_PROFILE.HEALTHY.perStore).fill("HEALTHY"),
    ...Array(PRODUCT_PROFILE.LOW.perStore).fill("LOW"),
    ...Array(PRODUCT_PROFILE.CRITICAL.perStore).fill("CRITICAL"),
  ];

  for (const profile of profileList) {
    nnn += 1;
    const category = CATEGORIES[(nnn - 1) % CATEGORIES.length];
    const namePool = PRODUCT_NAMES[category];
    const name = namePool[(nnn - 1) % namePool.length];
    const [minPrice, maxPrice] = CATEGORY_PRICE_BAND_CENTS[category];
    const unitPriceCents = randInt(rng, minPrice, maxPrice);
    const reorderPoint = randInt(rng, 5, 15);

    // Deterministic target on-hand from the profile band.
    const p = PRODUCT_PROFILE[profile];
    let targetOnHand;
    if (profile === "TOP")      targetOnHand = randInt(rng, p.initial[0] / 4 | 0, p.initial[1] / 2 | 0);
    else if (profile === "HEALTHY") targetOnHand = randInt(rng, reorderPoint * 2, reorderPoint * 4);
    else if (profile === "LOW") targetOnHand = randInt(rng, 1, reorderPoint - 1);
    else /* CRITICAL */          targetOnHand = randInt(rng, 0, 1);

    products.push({
      sku: `DEMO-${store.code}-${String(nnn).padStart(3, "0")}`,
      name: `${name} (${store.code})`,
      categoryId: categoriesByName.get(category).id,
      storeId: store.id,
      unitPriceCents,
      reorderPoint,
      // Not persisted; used during inventory generation:
      _profile: profile,
      _initialStock: randInt(rng, p.initial[0], p.initial[1]),
      _targetOnHand: targetOnHand,
    });
  }
  return products;
}

async function seedProducts(prisma, allProducts) {
  const persistable = allProducts.map(({ _profile, _initialStock, _targetOnHand, ...rest }) => rest);
  await chunked(persistable, 500, async (batch) => {
    await prisma.product.createMany({ data: batch, skipDuplicates: true });
  });
  // Refetch to get IDs and merge back onto the in-memory objects (preserves _profile etc).
  const rows = await prisma.product.findMany({ where: { sku: { startsWith: "DEMO-" } } });
  const bySku = new Map(rows.map((r) => [r.sku, r]));
  for (const p of allProducts) {
    const row = bySku.get(p.sku);
    if (!row) throw new Error(`Product not persisted: ${p.sku}`);
    p.id = row.id;
  }
  return allProducts;
}
```

- [ ] **Step 3: Compile-check via require**

Run: `node -e "require('./prisma/seed-demo.cjs')"`
Expected: prints the placeholder message and exits 1. No syntax errors.

- [ ] **Step 4: Existing tests still pass**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed-demo.cjs
git commit -m "feat(seed-demo): category, store, and product generators"
```

---

## Task 7: Customer seeding

**Files:**
- Modify: `prisma/seed-demo.cjs` (add `buildCustomers`, `seedCustomers`)

- [ ] **Step 1: Add customer generator + seeder**

Insert AFTER `seedProducts`:

```javascript
// ---------- Customer generation ---------------------------------------------

function buildCustomers(rng) {
  const customers = [];
  for (let i = 1; i <= NUM_CUSTOMERS; i++) {
    const nnn = String(i).padStart(3, "0");
    const first = pick(rng, CUSTOMER_FIRST_NAMES);
    const last = pick(rng, CUSTOMER_LAST_NAMES);
    customers.push({
      email: `demo-customer-${nnn}@demo.seed`,
      fullName: `${first} ${last}`,
      // firstOrderAt is set to null here; we update it after orders are generated.
    });
  }
  return customers;
}

async function seedCustomers(prisma, customers) {
  await chunked(customers, 500, async (batch) => {
    await prisma.customer.createMany({ data: batch, skipDuplicates: true });
  });
  const rows = await prisma.customer.findMany({
    where: { email: { endsWith: "@demo.seed" } },
  });
  const byEmail = new Map(rows.map((r) => [r.email, r]));
  for (const c of customers) {
    const row = byEmail.get(c.email);
    if (!row) throw new Error(`Customer not persisted: ${c.email}`);
    c.id = row.id;
  }
  return customers;
}

/**
 * After orders are generated, backfill each customer's earliest placedAt as
 * firstOrderAt. Called once at the end of order generation.
 */
async function backfillFirstOrderAt(prisma, customers, orders) {
  const earliestByCustomerId = new Map();
  for (const o of orders) {
    const cur = earliestByCustomerId.get(o.customerId);
    if (!cur || o.placedAt < cur) earliestByCustomerId.set(o.customerId, o.placedAt);
  }
  await chunked(Array.from(earliestByCustomerId.entries()), 100, async (batch) => {
    await Promise.all(
      batch.map(([customerId, firstOrderAt]) =>
        prisma.customer.update({ where: { id: customerId }, data: { firstOrderAt } })
      )
    );
  });
}
```

- [ ] **Step 2: Compile-check**

Run: `node -e "require('./prisma/seed-demo.cjs')"`
Expected: prints placeholder message, exits 1, no syntax errors.

- [ ] **Step 3: Existing tests still pass**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: PASS — 13 tests.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed-demo.cjs
git commit -m "feat(seed-demo): customer generator with first-order backfill"
```

---

## Task 8: Order + OrderItem generation

**Files:**
- Modify: `prisma/seed-demo.cjs` (add day/window helpers and `buildOrdersForStore`, `seedOrders`)

- [ ] **Step 1: Add time-window and status helpers**

Insert AFTER `backfillFirstOrderAt`:

```javascript
// ---------- Time-window helpers ---------------------------------------------

/** Returns Date at exact midnight UTC for the given day offset from `to`. */
function utcMidnight(to, dayOffset) {
  const d = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d;
}

function weekdayFactor(date) {
  const dow = date.getUTCDay(); // 0=Sun ... 6=Sat
  if (dow === 0) return 0.6;    // Sun
  if (dow === 6) return 1.35;   // Sat
  if (dow === 5) return 1.15;   // Fri
  return 1.0;                    // Mon-Thu
}

function seasonalityFactor(dayIndex, totalDays) {
  // Linear 1.0 -> 1.25 across the window.
  return 1.0 + 0.25 * (dayIndex / Math.max(1, totalDays - 1));
}

function pickStatus(rng) {
  return weightedPick(
    rng,
    ORDER_STATUS_MIX.map((m) => m.status),
    ORDER_STATUS_MIX.map((m) => m.weight)
  );
}
```

- [ ] **Step 2: Add `buildOrdersForStore`**

Continue:

```javascript
// ---------- Order generation ------------------------------------------------

/**
 * Generates all orders (with items) for one store across the WINDOW_DAYS window.
 * Returns { orders, items } as JS arrays; nothing is persisted here.
 * Also returns per-product sales tallies so inventory generation can consume them.
 */
function buildOrdersForStore(rng, store, storeProducts, customers, repeatPool, now) {
  const orders = [];
  const items = [];

  // Precompute product weights for weightedPick.
  const productWeights = storeProducts.map((p) => {
    if (p._profile === "TOP") return 5;
    if (p._profile === "HEALTHY") return 1;
    if (p._profile === "LOW") return 0.3;
    return 0.1; // CRITICAL
  });

  for (let dayOffset = -WINDOW_DAYS + 1; dayOffset <= 0; dayOffset++) {
    const dayStart = utcMidnight(now, dayOffset);
    const dayIndex = WINDOW_DAYS - 1 + dayOffset; // 0..WINDOW_DAYS-1
    const noise = 0.85 + rng() * 0.3;
    const rawCount =
      store.baseOrdersPerDay *
      weekdayFactor(dayStart) *
      seasonalityFactor(dayIndex, WINDOW_DAYS) *
      noise;
    const count = Math.max(1, Math.round(rawCount));

    for (let k = 0; k < count; k++) {
      // Customer: 70% from repeat pool, 30% uniform.
      const customer =
        rng() < REPEAT_PROBABILITY ? pick(rng, repeatPool) : pick(rng, customers);

      // Time within the day.
      const placedAt = new Date(dayStart.getTime() + Math.floor(rng() * 86400000));
      const status = pickStatus(rng);

      // Line items: 1..4 distinct products.
      const numLines = randInt(rng, 1, 4);
      const chosen = new Set();
      const orderItems = [];
      let totalCents = 0;
      let attempts = 0;
      while (chosen.size < numLines && attempts < numLines * 5) {
        attempts++;
        const p = weightedPick(rng, storeProducts, productWeights);
        if (chosen.has(p.sku)) continue;
        chosen.add(p.sku);
        const quantity = randInt(rng, 1, 3);
        const subtotalCents = quantity * p.unitPriceCents;
        totalCents += subtotalCents;
        orderItems.push({
          productSku: p.sku, // resolved to productId after order.id is known
          quantity,
          unitPriceCents: p.unitPriceCents,
          subtotalCents,
        });
      }

      // paidAt / refundedAt
      let paidAt = null;
      let refundedAt = null;
      if (status === "PAID" || status === "REFUNDED") {
        paidAt = new Date(placedAt.getTime() + Math.floor(rng() * 15 * 60000));
      }
      if (status === "REFUNDED") {
        const refundDelayMs = (1 + rng() * 29) * 86400000;
        refundedAt = new Date(Math.min(now.getTime(), paidAt.getTime() + refundDelayMs));
      }

      const orderKey = `${store.code}-${dayOffset}-${k}`; // stable identifier for cross-referencing before DB assigns id
      orders.push({
        _key: orderKey,
        storeId: store.id,
        customerId: customer.id,
        status,
        currency: store.baseCurrency,
        totalCents,
        placedAt,
        paidAt,
        refundedAt,
      });
      for (const item of orderItems) {
        items.push({ _orderKey: orderKey, ...item });
      }
    }
  }
  return { orders, items };
}
```

- [ ] **Step 3: Add `seedOrders` (persist orders and items)**

Continue:

```javascript
async function seedOrders(prisma, orders, items, productBySku) {
  // Persist orders in batches with nested item creates. We do NOT use
  // createMany for orders because we need Order IDs to link items and we
  // want the nested-create pattern for simplicity + FK integrity.
  await chunked(orders, 50, async (batch) => {
    await Promise.all(
      batch.map((o) => {
        const itemCreates = items
          .filter((it) => it._orderKey === o._key)
          .map((it) => ({
            productId: productBySku.get(it.productSku).id,
            quantity: it.quantity,
            unitPriceCents: it.unitPriceCents,
            subtotalCents: it.subtotalCents,
          }));
        return prisma.order
          .create({
            data: {
              storeId: o.storeId,
              customerId: o.customerId,
              status: o.status,
              currency: o.currency,
              totalCents: o.totalCents,
              placedAt: o.placedAt,
              paidAt: o.paidAt,
              refundedAt: o.refundedAt,
              items: { create: itemCreates },
            },
            select: { id: true },
          })
          .then((row) => {
            o.id = row.id; // mutate in place so inventory phase can reference it
          });
      })
    );
  });
}
```

Note the O(orders × items) filter inside `chunked` is fine for our scale (~2400 orders / ~5500 items) and keeps the code readable. If a future scale-up is needed, group items into a `Map<orderKey, item[]>` up front.

- [ ] **Step 4: Compile-check + tests**

Run: `node -e "require('./prisma/seed-demo.cjs')"` — expect placeholder exit 1, no syntax error.
Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs` — expect PASS 13.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed-demo.cjs
git commit -m "feat(seed-demo): order and order-item generation"
```

---

## Task 9: Inventory movements (opening + sales + restocks + noise)

**Files:**
- Modify: `prisma/seed-demo.cjs` (add `buildInventoryForProduct`, `seedInventory`)

- [ ] **Step 1: Add inventory generator**

Insert AFTER `seedOrders`:

```javascript
// ---------- Inventory generation --------------------------------------------

/**
 * Given a product and all its sales (from orders), produce the ordered list
 * of InventoryMovement rows for this product:
 *
 *   1. Opening PURCHASE at (from - 1 day).
 *   2. One SALE per OrderItem (delta = -quantity), occurredAt = order.placedAt.
 *   3. Periodic restock PURCHASEs (TOP/HEALTHY only).
 *   4. Noise: rare ADJUSTMENT (shrinkage), rare RETURN.
 *
 * Corrective row is added in Task 10 by a separate function.
 */
function buildInventoryForProduct(rng, product, sales, now) {
  const movements = [];
  const from = utcMidnight(now, -WINDOW_DAYS + 1);
  const opening = new Date(from.getTime() - 86400000);

  // 1. Opening purchase
  movements.push({
    storeId: product.storeId,
    productId: product.id,
    delta: product._initialStock,
    reason: "PURCHASE",
    orderId: null,
    note: DEMO_TAG,
    occurredAt: opening,
  });

  // 2. Sales
  for (const sale of sales) {
    movements.push({
      storeId: product.storeId,
      productId: product.id,
      delta: -sale.quantity,
      reason: "SALE",
      orderId: sale.orderId,
      note: DEMO_TAG,
      occurredAt: sale.placedAt,
    });
  }

  // 3. Periodic restocks (TOP/HEALTHY only)
  const p = PRODUCT_PROFILE[product._profile];
  if (p.restockEveryDays !== null) {
    for (let dayOffset = -WINDOW_DAYS + 1 + p.restockEveryDays; dayOffset <= 0; dayOffset += p.restockEveryDays) {
      const when = new Date(utcMidnight(now, dayOffset).getTime() + Math.floor(rng() * 86400000));
      movements.push({
        storeId: product.storeId,
        productId: product.id,
        delta: randInt(rng, p.restockAmount[0], p.restockAmount[1]),
        reason: "PURCHASE",
        orderId: null,
        note: DEMO_TAG,
        occurredAt: when,
      });
    }
  } else {
    // LOW/CRITICAL: one early restock around day 10 of the window
    const earlyOffset = -WINDOW_DAYS + 10;
    const when = new Date(utcMidnight(now, earlyOffset).getTime() + Math.floor(rng() * 86400000));
    movements.push({
      storeId: product.storeId,
      productId: product.id,
      delta: randInt(rng, 5, 15),
      reason: "PURCHASE",
      orderId: null,
      note: DEMO_TAG,
      occurredAt: when,
    });
  }

  // 4. Noise
  if (rng() < 0.03) {
    // Shrinkage
    const dayOffset = -randInt(rng, 1, WINDOW_DAYS - 1);
    const when = new Date(utcMidnight(now, dayOffset).getTime() + Math.floor(rng() * 86400000));
    movements.push({
      storeId: product.storeId,
      productId: product.id,
      delta: -randInt(rng, 1, 3),
      reason: "ADJUSTMENT",
      orderId: null,
      note: DEMO_TAG,
      occurredAt: when,
    });
  }
  for (const sale of sales) {
    if (sale.status === "PAID" && rng() < 0.05) {
      const returnDelayDays = randInt(rng, 1, 10);
      const returnAt = new Date(
        Math.min(now.getTime(), sale.placedAt.getTime() + returnDelayDays * 86400000)
      );
      movements.push({
        storeId: product.storeId,
        productId: product.id,
        delta: 1,
        reason: "RETURN",
        orderId: sale.orderId,
        note: DEMO_TAG,
        occurredAt: returnAt,
      });
    }
  }

  return movements;
}

async function seedInventory(prisma, movements) {
  await chunked(movements, 1000, async (batch) => {
    await prisma.inventoryMovement.createMany({ data: batch });
  });
}
```

- [ ] **Step 2: Compile-check + tests**

Run: `node -e "require('./prisma/seed-demo.cjs')"` — expect placeholder exit 1, no syntax error.
Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs` — expect PASS 13.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed-demo.cjs
git commit -m "feat(seed-demo): inventory movements (opening, sales, restocks, noise)"
```

---

## Task 10: Corrective inventory row + invariant assertions

**Files:**
- Modify: `prisma/seed-demo.cjs` (add `computeCorrectiveMovements`, `assertInventoryInvariants`)
- Modify: `prisma/__tests__/seed-demo-helpers.test.cjs` (unit-test the invariant checker)

- [ ] **Step 1: Add failing test for `assertInventoryInvariants`**

Append to `prisma/__tests__/seed-demo-helpers.test.cjs`:

```javascript
const { assertInventoryInvariants, computeCorrectiveMovements } = require("../seed-demo.cjs");

describe("assertInventoryInvariants", () => {
  const mkProduct = (sku, profile, reorderPoint) => ({
    sku, id: 1, storeId: 1, _profile: profile, reorderPoint,
  });
  const mkMove = (productId, delta) => ({ productId, delta });

  it("passes for a HEALTHY product above reorder", () => {
    const products = [mkProduct("S-1", "HEALTHY", 5)];
    const moves = [mkMove(1, 20)];
    expect(() => assertInventoryInvariants(products, moves)).not.toThrow();
  });

  it("fails when LOW product ends at or above reorderPoint", () => {
    const products = [mkProduct("S-2", "LOW", 5)];
    const moves = [mkMove(1, 5)]; // final = 5, expected < 5
    expect(() => assertInventoryInvariants(products, moves)).toThrow(/DEMO.*LOW|S-2/);
  });

  it("fails when CRITICAL product ends above 1", () => {
    const products = [mkProduct("S-3", "CRITICAL", 5)];
    const moves = [mkMove(1, 2)];
    expect(() => assertInventoryInvariants(products, moves)).toThrow(/CRITICAL|S-3/);
  });

  it("fails when TOP product ends below reorder*3", () => {
    const products = [mkProduct("S-4", "TOP", 10)];
    const moves = [mkMove(1, 29)]; // needs >=30
    expect(() => assertInventoryInvariants(products, moves)).toThrow(/TOP|S-4/);
  });

  it("fails when any product ends below zero", () => {
    const products = [mkProduct("S-5", "HEALTHY", 5)];
    const moves = [mkMove(1, 10), mkMove(1, -20)];
    expect(() => assertInventoryInvariants(products, moves)).toThrow(/negative|S-5/);
  });
});

describe("computeCorrectiveMovements", () => {
  const now = new Date(Date.UTC(2026, 6, 1));
  it("emits a PURCHASE when actual < target", () => {
    const products = [{ id: 1, storeId: 1, _profile: "HEALTHY", _targetOnHand: 50 }];
    const moves = [{ productId: 1, delta: 30 }];
    const corr = computeCorrectiveMovements(products, moves, now);
    expect(corr).toHaveLength(1);
    expect(corr[0].delta).toBe(20);
    expect(corr[0].reason).toBe("PURCHASE");
    expect(corr[0].note).toBe("demo-seed-v1 corrective");
  });

  it("emits an ADJUSTMENT when actual > target", () => {
    const products = [{ id: 1, storeId: 1, _profile: "HEALTHY", _targetOnHand: 50 }];
    const moves = [{ productId: 1, delta: 70 }];
    const corr = computeCorrectiveMovements(products, moves, now);
    expect(corr).toHaveLength(1);
    expect(corr[0].delta).toBe(-20);
    expect(corr[0].reason).toBe("ADJUSTMENT");
  });

  it("emits nothing when actual == target", () => {
    const products = [{ id: 1, storeId: 1, _profile: "HEALTHY", _targetOnHand: 50 }];
    const moves = [{ productId: 1, delta: 50 }];
    expect(computeCorrectiveMovements(products, moves, now)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: FAIL — undefined exports.

- [ ] **Step 3: Implement**

Insert AFTER `seedInventory` in `prisma/seed-demo.cjs`:

```javascript
// ---------- Corrective row + invariants -------------------------------------

/**
 * Given the products (with _profile, _targetOnHand) and all movements
 * generated so far, emit one corrective movement per product that closes
 * the gap between actualOnHand and _targetOnHand. Occurs at (to - 1 hour).
 */
function computeCorrectiveMovements(products, movements, now) {
  const sumByProduct = new Map();
  for (const m of movements) {
    sumByProduct.set(m.productId, (sumByProduct.get(m.productId) || 0) + m.delta);
  }
  const when = new Date(now.getTime() - 3600 * 1000);
  const corrective = [];
  for (const p of products) {
    const actual = sumByProduct.get(p.id) || 0;
    const gap = p._targetOnHand - actual;
    if (gap === 0) continue;
    corrective.push({
      storeId: p.storeId,
      productId: p.id,
      delta: gap,
      reason: gap > 0 ? "PURCHASE" : "ADJUSTMENT",
      orderId: null,
      note: DEMO_TAG_CORRECTIVE,
      occurredAt: when,
    });
  }
  return corrective;
}

/**
 * Sanity-check the engineered inventory profiles. Should never fire after
 * computeCorrectiveMovements has been applied. Failure => throw, caller
 * rolls back the transaction.
 */
function assertInventoryInvariants(products, allMovements) {
  const sumByProduct = new Map();
  for (const m of allMovements) {
    sumByProduct.set(m.productId, (sumByProduct.get(m.productId) || 0) + m.delta);
  }
  const errors = [];
  for (const p of products) {
    const final = sumByProduct.get(p.id) || 0;
    if (final < 0) {
      errors.push(`  ${p.sku}: negative final on-hand (${final})`);
      continue;
    }
    if (p._profile === "LOW" && !(final > 0 && final < p.reorderPoint)) {
      errors.push(`  ${p.sku}: expected LOW (0 < final < reorderPoint=${p.reorderPoint}), got ${final}`);
    } else if (p._profile === "CRITICAL" && final > 1) {
      errors.push(`  ${p.sku}: expected CRITICAL (final <= 1), got ${final}`);
    } else if (p._profile === "TOP" && final < p.reorderPoint * 3) {
      errors.push(`  ${p.sku}: expected TOP (final >= reorderPoint*3=${p.reorderPoint * 3}), got ${final}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(
      "Invariant failed (seed-script bug):\n" + errors.join("\n")
    );
  }
}
```

Extend `module.exports`:

```javascript
module.exports = {
  xfnv1a, mulberry32, randInt, pick, weightedPick, gaussian, chunked,
  parseArgs, computeCorrectiveMovements, assertInventoryInvariants,
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: PASS — 21 tests (13 + 8 new).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed-demo.cjs prisma/__tests__/seed-demo-helpers.test.cjs
git commit -m "feat(seed-demo): corrective inventory row + invariant assertions"
```

---

## Task 11: FX rate generation (AR(1) drift + midnight-UTC snapshots)

**Files:**
- Modify: `prisma/seed-demo.cjs` (add `buildFxRates`, `seedFxRates`)
- Modify: `prisma/__tests__/seed-demo-helpers.test.cjs` (basic FX build test)

- [ ] **Step 1: Add failing test**

Append to `prisma/__tests__/seed-demo-helpers.test.cjs`:

```javascript
const { buildFxRates } = require("../seed-demo.cjs");

describe("buildFxRates", () => {
  const now = new Date(Date.UTC(2026, 6, 1)); // Jul 1 2026 midnight UTC

  it("produces 20 pairs x 92 days = 1840 rows", () => {
    const rng = mulberry32(xfnv1a("fx"));
    const rows = buildFxRates(rng, now);
    expect(rows).toHaveLength(20 * 92);
  });

  it("every asOf is exact midnight UTC", () => {
    const rng = mulberry32(xfnv1a("fx-midnight"));
    const rows = buildFxRates(rng, now);
    for (const r of rows) {
      const d = r.asOf;
      expect(d.getUTCHours()).toBe(0);
      expect(d.getUTCMinutes()).toBe(0);
      expect(d.getUTCSeconds()).toBe(0);
      expect(d.getUTCMilliseconds()).toBe(0);
    }
  });

  it("rate strings are non-empty and parseable numbers", () => {
    const rng = mulberry32(xfnv1a("fx-numeric"));
    const rows = buildFxRates(rng, now);
    for (const r of rows.slice(0, 20)) {
      const n = Number(r.rate);
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
    }
  });

  it("USD->USD is not present (identity excluded)", () => {
    const rng = mulberry32(xfnv1a("fx-id"));
    const rows = buildFxRates(rng, now);
    for (const r of rows) {
      expect(r.baseCurrency === r.quoteCurrency).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: FAIL — `buildFxRates is not a function`.

- [ ] **Step 3: Implement**

Insert AFTER `assertInventoryInvariants` in `prisma/seed-demo.cjs`:

```javascript
// ---------- FX rate generation ---------------------------------------------

/**
 * Build the full daily FX matrix for the demo window.
 *
 * Model:
 *   For each non-USD currency X, a seeded AR(1) walk drives USD->X across
 *   the window with sigma ~= 0.3%/day, clamped to +/-4%. Cross rates and
 *   inverse rates are derived by triangulation through USD each day so the
 *   matrix stays internally consistent.
 *
 * Returns an array of Prisma FxRate.create data:
 *   { baseCurrency, quoteCurrency, rate: string, asOf: Date }
 */
function buildFxRates(rng, now) {
  const days = WINDOW_DAYS;
  const nonUsd = DEMO_CURRENCIES.filter((c) => c !== "USD");
  const walks = {}; // ccy -> Array<multiplier> length=days
  for (const ccy of nonUsd) {
    const arr = new Array(days);
    let cur = 0;
    const phi = 0.85; // AR(1) coefficient
    const sigma = 0.003;
    for (let i = 0; i < days; i++) {
      cur = phi * cur + sigma * gaussian(rng);
      cur = Math.max(-0.04, Math.min(0.04, cur));
      arr[i] = 1 + cur;
    }
    walks[ccy] = arr;
  }

  const rows = [];
  for (let i = 0; i < days; i++) {
    // dayOffset -91 .. 0 (inclusive); we want oldest first up to today.
    const dayOffset = -(days - 1) + i;
    const asOf = utcMidnight(now, dayOffset);

    // Compute today's USD -> X for every X in DEMO_CURRENCIES.
    const usdTo = {};
    for (const ccy of DEMO_CURRENCIES) {
      if (ccy === "USD") { usdTo[ccy] = 1.0; continue; }
      usdTo[ccy] = USD_ANCHORS[ccy] * walks[ccy][i];
    }

    // Emit all directed pairs (base != quote).
    for (const base of DEMO_CURRENCIES) {
      for (const quote of DEMO_CURRENCIES) {
        if (base === quote) continue;
        // rate = usdTo[quote] / usdTo[base]  (triangulation through USD)
        const rate = usdTo[quote] / usdTo[base];
        rows.push({
          baseCurrency: base,
          quoteCurrency: quote,
          rate: rate.toFixed(8),
          asOf,
        });
      }
    }
  }
  return rows;
}

async function seedFxRates(prisma, rows) {
  await chunked(rows, 1000, async (batch) => {
    await prisma.fxRate.createMany({ data: batch, skipDuplicates: true });
  });
}
```

Extend `module.exports`:

```javascript
module.exports = {
  xfnv1a, mulberry32, randInt, pick, weightedPick, gaussian, chunked,
  parseArgs, computeCorrectiveMovements, assertInventoryInvariants,
  buildFxRates,
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: PASS — 25 tests (21 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed-demo.cjs prisma/__tests__/seed-demo-helpers.test.cjs
git commit -m "feat(seed-demo): FX matrix with AR(1) daily drift"
```

---

## Task 12: `main()` orchestration and summary output

**Files:**
- Modify: `prisma/seed-demo.cjs` (replace placeholder `main()` with the real one)

- [ ] **Step 1: Replace `main()`**

Replace the placeholder `main()` at the bottom of `prisma/seed-demo.cjs` with:

```javascript
async function main(prisma, flags) {
  const t0 = Date.now();
  const seedString = process.env.SEED_RANDOM_SEED || "react-dashboard-demo";
  const owner = await resolveOwner(prisma);
  console.log(`Owner: ${owner.email} (accountId=${owner.accountId})`);
  console.log(`Seed string: "${seedString}"`);

  if (!flags.keep) {
    await clearDemo(prisma);
  }
  if (flags.clear) {
    console.log("Clear-only mode: done.");
    return;
  }

  const now = new Date();
  const rng = mulberry32(xfnv1a(seedString));

  // Categories + stores must exist before we can reference IDs from products,
  // so we run them OUTSIDE the big transaction. They use upsert/find-or-create
  // and are safe to re-run.
  const categoriesByName = await seedCategories(prisma);
  const stores = await seedStores(prisma, owner.accountId);

  // Generate all in-memory data BEFORE opening the transaction so the tx
  // is purely bulk-insert (no CPU-bound work inside).
  const allProducts = [];
  for (const store of stores) {
    allProducts.push(...buildProducts(rng, store, categoriesByName));
  }
  const customers = buildCustomers(rng);
  const repeatPool = customers.slice(0, REPEAT_POOL_SIZE);

  await prisma.$transaction(
    async (tx) => {
      await seedProducts(tx, allProducts);
      await seedCustomers(tx, customers);

      // Build a productBySku lookup after products have IDs.
      const productBySku = new Map(allProducts.map((p) => [p.sku, p]));

      // Orders + items per store.
      const allOrders = [];
      const allItems = [];
      for (const store of stores) {
        const storeProducts = allProducts.filter((p) => p.storeId === store.id);
        const { orders, items } = buildOrdersForStore(
          rng, store, storeProducts, customers, repeatPool, now
        );
        allOrders.push(...orders);
        allItems.push(...items);
      }
      await seedOrders(tx, allOrders, allItems, productBySku);
      await backfillFirstOrderAt(tx, customers, allOrders);

      // Build inventory movements from sales.
      // For each product, gather its sales (with placedAt + orderId + status).
      const salesByProduct = new Map();
      for (const o of allOrders) {
        const relatedItems = allItems.filter((it) => it._orderKey === o._key);
        for (const it of relatedItems) {
          const p = productBySku.get(it.productSku);
          if (!salesByProduct.has(p.id)) salesByProduct.set(p.id, []);
          salesByProduct.get(p.id).push({
            quantity: it.quantity,
            placedAt: o.placedAt,
            orderId: o.id,
            status: o.status,
          });
        }
      }

      const movements = [];
      for (const p of allProducts) {
        const sales = salesByProduct.get(p.id) || [];
        movements.push(...buildInventoryForProduct(rng, p, sales, now));
      }

      // Corrective row (skipped for --keep additive batches).
      if (!flags.keep) {
        movements.push(...computeCorrectiveMovements(allProducts, movements, now));
      }

      await seedInventory(tx, movements);

      // FX matrix.
      const fx = buildFxRates(rng, now);
      await seedFxRates(tx, fx);

      // Sanity assertions (should never fire after corrective step). Skipped
      // for --keep because additive batches deliberately don't include a
      // corrective row and the assertions only apply to the full-reseed path.
      if (!flags.keep) {
        assertInventoryInvariants(allProducts, movements);
      }

      // Store counts on outer scope via closure for the summary line.
      main.__lastRunStats = {
        stores: stores.length,
        categories: categoriesByName.size,
        products: allProducts.length,
        productsByProfile: countByProfile(allProducts),
        customers: customers.length,
        orders: allOrders.length,
        ordersByStatus: countByStatus(allOrders),
        orderItems: allItems.length,
        movements: movements.length,
        fxRates: fx.length,
        from: utcMidnight(now, -WINDOW_DAYS + 1),
        to: now,
      };
    },
    { timeout: 120_000, maxWait: 10_000 }
  );

  printSummary(main.__lastRunStats, seedString, ((Date.now() - t0) / 1000).toFixed(1));
}

function countByProfile(products) {
  const c = { TOP: 0, HEALTHY: 0, LOW: 0, CRITICAL: 0 };
  for (const p of products) c[p._profile] += 1;
  return c;
}

function countByStatus(orders) {
  const c = { PAID: 0, PENDING: 0, REFUNDED: 0, CANCELLED: 0 };
  for (const o of orders) c[o.status] += 1;
  return c;
}

function printSummary(s, seedString, elapsedSec) {
  const storeLabels = STORES.map((x) => `${x.location} ${x.baseCurrency}`).join(", ");
  console.log(`\nDemo seed complete (seed="${seedString}", elapsed ${elapsedSec}s):`);
  console.log(`  Stores:      ${s.stores} (${storeLabels})`);
  console.log(`  Categories:  ${s.categories}`);
  console.log(
    `  Products:    ${s.products}  ` +
      `(${s.productsByProfile.TOP} top-sellers, ${s.productsByProfile.LOW} LOW, ` +
      `${s.productsByProfile.CRITICAL} CRITICAL, ${s.productsByProfile.HEALTHY} healthy)`
  );
  console.log(`  Customers:   ${s.customers}  (~${REPEAT_POOL_SIZE} repeat)`);
  console.log(
    `  Orders:      ${s.orders}  ` +
      `(PAID ${s.ordersByStatus.PAID} / PENDING ${s.ordersByStatus.PENDING} / ` +
      `REFUNDED ${s.ordersByStatus.REFUNDED} / CANCELLED ${s.ordersByStatus.CANCELLED})`
  );
  console.log(`  OrderItems:  ${s.orderItems}`);
  console.log(`  Movements:   ${s.movements}`);
  console.log(`  FxRates:     ${s.fxRates}  (${DEMO_CURRENCIES.length}x${DEMO_CURRENCIES.length - 1} pairs x ${WINDOW_DAYS} days)`);
  console.log(
    `  Window:      ${s.from.toISOString().slice(0, 10)} -> ${s.to.toISOString().slice(0, 10)}\n`
  );
  console.log("Open http://localhost:3000/dashboard to verify.");
}
```

- [ ] **Step 2: Run helper tests**

Run: `npx vitest run prisma/__tests__/seed-demo-helpers.test.cjs`
Expected: PASS — 25 tests.

- [ ] **Step 3: End-to-end run against a real DB**

Prerequisites: `.env` has a working `DATABASE_URL`, `prisma migrate deploy` has run, at least one `User` row exists (sign up at `http://localhost:3000/signup`).

Run: `node prisma/seed-demo.cjs`
Expected:
- Prints owner + seed string.
- Prints "Cleared demo rows ..." (all zero on first run).
- Prints "Demo seed complete ..." summary with:
  - Stores: 3 (Jakarta IDR, Berlin EUR, New York USD)
  - Products: 30 (6 top-sellers, 6 LOW, 3 CRITICAL, 15 healthy)
  - Customers: 90
  - Orders: ~2,300–2,500 with a PAID-heavy status mix
  - FxRates: 1,840
- Total elapsed under ~30s.

Run: `node prisma/seed-demo.cjs` again.
Expected: Cleared counts now non-zero; summary numbers identical to first run (determinism).

- [ ] **Step 4: Commit**

```bash
git add prisma/seed-demo.cjs
git commit -m "feat(seed-demo): main() orchestration inside single transaction"
```

---

## Task 13: npm scripts + full manual verification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add npm scripts**

Open `package.json` and add two entries inside the `"scripts"` object (alphabetize as convenient; the existing scripts are unordered):

```json
"seed:demo": "node prisma/seed-demo.cjs",
"seed:demo:clear": "node prisma/seed-demo.cjs --clear"
```

The exact `"scripts"` block should look like:

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build --turbopack",
  "build:doppler": "doppler run -- next build --turbopack",
  "migrate": "prisma migrate deploy",
  "build:vercel": "prisma generate && next build --turbopack",
  "start": "next start",
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "test": "vitest",
  "test:run": "vitest run",
  "seed:demo": "node prisma/seed-demo.cjs",
  "seed:demo:clear": "node prisma/seed-demo.cjs --clear"
},
```

- [ ] **Step 2: Verify scripts work**

Run: `npm run seed:demo:clear`
Expected: prints "Cleared demo rows ..." with the counts from the previous seed. Non-zero if you ran Task 12.

Run: `npm run seed:demo`
Expected: full summary as in Task 12 Step 3.

- [ ] **Step 3: Full manual verification per spec §9**

Perform each check and record PASS/FAIL:

1. **Fresh DB:** `prisma migrate deploy && npm run seed:demo`. Confirm the summary line counts match spec expectations. → PASS?
2. **Dashboard visual:** open `http://localhost:3000/dashboard`:
   - Daily / Weekly / Monthly views all show non-empty revenue series. → PASS?
   - Currency switcher converts to all 5 currencies (USD, EUR, GBP, JPY, IDR); values change. → PASS?
   - Per-store filter shows 3 stores (Jakarta / Berlin / NYC). → PASS?
   - Low-stock alerts panel shows ~9 alerts (6 LOW + 3 CRITICAL). → PASS?
   - Top-products panel shows the top 6 sellers ranked clearly above the rest. → PASS?
3. **Determinism:** run `npm run seed:demo` a second time. Confirm no errors and summary numbers are byte-identical to the first run. → PASS?
4. **Clear leaves user data alone:** `npm run seed:demo:clear`. Then run:
   ```bash
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"Store\" WHERE name LIKE 'Demo — %';"
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"Product\" WHERE sku LIKE 'DEMO-%';"
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"Customer\" WHERE email LIKE '%@demo.seed';"
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"User\";"
   ```
   Expected: first three return 0; `User` count unchanged from before. → PASS?
5. **Smoke coexistence:** run `node prisma/seed-smoke.cjs`, then `npm run seed:demo`, then `npm run seed:demo:clear`. Confirm smoke data survives:
   ```bash
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"Store\" WHERE name = 'Smoke Test Store';"
   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"FxRate\" WHERE \"baseCurrency\"='USD' AND \"quoteCurrency\"='EUR';"
   ```
   Expected: store count = 1, FX row count ≥ 1 (the smoke row's `asOf` has sub-day time, so `EXTRACT(EPOCH FROM asOf) % 86400 <> 0` and the demo clear skipped it). → PASS?
6. **Editable FX:** reseed demo (`npm run seed:demo`). In pgAdmin (or `psql`), pick one recent FxRate row and multiply the rate by 2:
   ```sql
   UPDATE "FxRate"
   SET rate = rate * 2
   WHERE "baseCurrency"='USD' AND "quoteCurrency"='EUR'
   ORDER BY "asOf" DESC LIMIT 1;
   ```
   Refresh the dashboard with currency = EUR and confirm the converted revenue on that date visibly doubles. → PASS?

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(seed-demo): add npm scripts seed:demo and seed:demo:clear"
```

- [ ] **Step 5: (optional) squash / clean history**

If your team prefers squashed feature commits, `git rebase -i` the 13 task commits into a single "feat(seed-demo): add deterministic demo seed script" commit before merging. Otherwise the commit-per-task history is fine and easier to review.

---

## Self-Review Notes

Coverage vs spec §§1–9:
- §1 Purpose / §2 Non-goals — met (script is env-driven, deterministic, tagged, doesn't modify User/Category schema).
- §3 Invocation contract — Task 1 (file), Task 4 (argv + env), Task 13 (npm scripts). Tags established in Tasks 3, 6, 7, 9.
- §4.1 Currencies + stores — Task 3 constants, Task 6 seedStores.
- §4.2 Categories — Task 3 constants, Task 6 seedCategories.
- §4.3 Products + profiles — Task 3 constants, Task 6 buildProducts.
- §4.4 Customers/orders/items — Task 7 (customers), Task 8 (orders + items).
- §4.5 Inventory movements incl. corrective — Task 9 (movements), Task 10 (corrective).
- §4.6 Invariants — Task 10 assertInventoryInvariants.
- §4.7 FX rates — Task 11 buildFxRates + seedFxRates.
- §5 Execution flow — Task 12 main().
- §6 Output — Task 12 printSummary.
- §7 Module structure — file grows in the section order specified (constants → PRNG → generators → persistence → clear → seed → main).
- §8 Open questions — --keep skips corrective (Task 12 Step 1); midnight-UTC FX clear (Task 5).
- §9 Test plan — Task 13 Step 3.

Placeholder scan: every step contains complete code or an exact command. No "TODO fill in details", no "similar to Task N", no orphan type references.

Type consistency: `_profile`, `_initialStock`, `_targetOnHand`, `_key`, `_orderKey` are introduced in Task 6/8 and consumed consistently in Tasks 9/10/12. `DEMO_TAG`, `DEMO_TAG_CORRECTIVE`, `DEMO_TAG_PREFIX` are declared in Task 3 and used consistently in Tasks 5/9/10.
