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

// ---------- Module exports (for tests) ---------------------------------------

module.exports = { xfnv1a, mulberry32, randInt, pick, weightedPick, gaussian, chunked };

// Auto-run main() only when invoked directly (not when required by tests).
if (require.main === module) {
  // main() will be added in Task 12; keep a no-op placeholder for now.
  console.error("seed-demo.cjs: main() not yet implemented (Task 12).");
  process.exit(1);
}
