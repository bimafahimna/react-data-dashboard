/**
 * Demo seed for the dashboard. See docs/superpowers/specs/2026-07-01-demo-seed-script-design.md
 * for the original design and docs/superpowers/specs/2026-08-01-dashboard-kpis-v2-design.md
 * for the KPI v2 dataset requirements (YoY comparisons + per-store matrix).
 *
 * Dataset shape (v2):
 *   - 18 months (WINDOW_DAYS = 540) of daily activity so the "vs last year" chip
 *     has real data for the daily / weekly / monthly range presets.
 *   - A "legacy" customer cohort with firstOrderAt forced to well before the
 *     window so Repeat-customer metrics are non-empty in every range.
 *   - Three stores in three currencies so per-store matrix + FX both exercise.
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

const DEMO_TAG = "demo-seed-v2";
const DEMO_TAG_CORRECTIVE = "demo-seed-v2 corrective";
// Matches both v1 and v2 tagged rows so `--clear` cleans up any older seeded
// data when someone upgrades to the KPI v2 dataset.
const DEMO_TAG_PREFIX = "demo-seed-v";

// 18 months of daily activity. Sized to comfortably cover:
//   daily   (7 days)   + YoY window one year ago
//   weekly  (8 weeks)  + YoY window one year ago
//   monthly (6 months) + YoY window one year ago
const WINDOW_DAYS = 540;

const DEMO_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "IDR"];

/** Anchor USD-based rates as of "now" (seed run time). Other pairs are derived. */
const USD_ANCHORS = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 157.0,
  IDR: 16200.0,
};

// baseOrdersPerDay is tuned so the full 540-day reseed completes inside the
// Prisma transaction budget on a local Postgres. Bump these back up (and the
// transaction timeout below) if you're running against a beefier database.
const STORES = [
  { code: "JKT", name: "Demo — Jakarta Flagship", location: "Jakarta", baseCurrency: "IDR", baseOrdersPerDay: 6 },
  { code: "BER", name: "Demo — Berlin Outlet",   location: "Berlin",   baseCurrency: "EUR", baseOrdersPerDay: 4 },
  { code: "NYC", name: "Demo — NYC Showroom",    location: "New York", baseCurrency: "USD", baseOrdersPerDay: 5 },
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

/**
 * Customer cohort layout (indices into the customers array):
 *   [0, LEGACY_POOL_SIZE)                        → legacy: firstOrderAt is forced
 *                                                   to before the window so they
 *                                                   always count as Repeat.
 *   [0, REPEAT_POOL_SIZE)                        → repeat pool used by the 70%
 *                                                   heavy-user draw (superset of
 *                                                   the legacy pool).
 *   [REPEAT_POOL_SIZE, NUM_CUSTOMERS)            → tail: uniform draws, firstOrderAt
 *                                                   lands wherever their earliest
 *                                                   in-window order happens to be.
 * The larger customer pool keeps New/Repeat counts non-empty across an 18-month
 * window instead of every customer being classified as Repeat by month 4.
 */
const NUM_CUSTOMERS = 240;
const REPEAT_POOL_SIZE = 60;
const LEGACY_POOL_SIZE = 15;
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

// ---------- Row-count budget (DB-wide cap) ---------------------------------

const PRODUCTS_PER_STORE =
  PRODUCT_PROFILE.TOP.perStore +
  PRODUCT_PROFILE.HEALTHY.perStore +
  PRODUCT_PROFILE.LOW.perStore +
  PRODUCT_PROFILE.CRITICAL.perStore; // = 10
const AVG_ITEMS_PER_ORDER = 2.5; // midpoint of the 1..4-line range
const RETURN_PROBABILITY = 0.05;

/**
 * Predicts how many rows one full reseed (or one "Add batch" on a fresh DB)
 * will insert. The projection uses steady-state means from the RNG's own
 * distributions, so it is:
 *
 *   1. Deterministic w.r.t. the compile-time constants (no PRNG state).
 *   2. Always an over-estimate rather than an under-estimate (weekend spikes,
 *      shrinkage adjustments, corrective row, and legacy backfill are all
 *      counted at their maximum weight).
 *
 * Returned as a whole number to make arithmetic and env comparison friendly.
 */
function projectedBatchRows() {
  const totalBasePerDay = STORES.reduce((sum, s) => sum + s.baseOrdersPerDay, 0);
  // weekday factor mean ~= (5*1 + 1*1.15 + 1*1.35)/7 ≈ 1.07;
  // seasonality mean 1.125; noise mean 1.0. Round up to 1.25 for headroom.
  const meanOrdersPerDay = totalBasePerDay * 1.25;
  const orders = Math.ceil(WINDOW_DAYS * meanOrdersPerDay);
  const items = Math.ceil(orders * AVG_ITEMS_PER_ORDER);

  const totalProducts = STORES.length * PRODUCTS_PER_STORE;
  // Restock cadence: TOP every 14d, HEALTHY every 21d. Combined per-store:
  //   2 * (WINDOW_DAYS/14) + 5 * (WINDOW_DAYS/21).
  // LOW+CRITICAL each get one early restock (3 per store total).
  const restocksPerStore =
    2 * Math.ceil(WINDOW_DAYS / 14) +
    5 * Math.ceil(WINDOW_DAYS / 21) +
    3;
  const restocks = restocksPerStore * STORES.length;
  const returns = Math.ceil(items * RETURN_PROBABILITY);
  const openings = totalProducts;
  const correctives = totalProducts;
  const shrinkage = Math.ceil(totalProducts * 0.03);
  const movements = openings + items + restocks + returns + correctives + shrinkage;

  const fxPairs = DEMO_CURRENCIES.length * (DEMO_CURRENCIES.length - 1);
  const fxRates = fxPairs * WINDOW_DAYS;

  return (
    STORES.length +
    totalProducts +
    NUM_CUSTOMERS +
    orders +
    items +
    movements +
    fxRates
  );
}

const DEFAULT_MAX_TOTAL_ROWS = 3 * projectedBatchRows();

/**
 * Reads SEED_MAX_TOTAL_ROWS from the environment.
 *
 *   unset / empty / "0" → default (3 × projectedBatchRows())
 *   positive integer     → that value
 *   "unlimited" / "none" → Number.POSITIVE_INFINITY (opt out)
 *   anything else        → throws
 *
 * `envOverride` lets callers (and tests) inject the value without touching
 * process.env.
 */
function resolveMaxTotalRows(envOverride) {
  const raw = envOverride === undefined ? process.env.SEED_MAX_TOTAL_ROWS : envOverride;
  if (raw == null || raw === "" || raw === "0") return DEFAULT_MAX_TOTAL_ROWS;
  const lower = String(raw).trim().toLowerCase();
  if (lower === "unlimited" || lower === "none" || lower === "off") {
    return Number.POSITIVE_INFINITY;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(
      `SEED_MAX_TOTAL_ROWS must be a non-negative integer, "unlimited", or unset (got "${raw}").`,
    );
  }
  return n;
}

/**
 * Sums all demo-tagged rows across the entire database (all owners),
 * using the same predicates that `clearDemo` uses to identify demo data.
 *
 * Returns { total, byTable: { ... } } so callers can display or log breakdowns.
 * Runs the seven counts in parallel.
 */
async function countDemoRows(prisma) {
  const [
    inventoryMovements,
    orderItems,
    orders,
    products,
    customers,
    stores,
    fxRates,
  ] = await Promise.all([
    prisma.inventoryMovement.count({
      where: { note: { startsWith: DEMO_TAG_PREFIX } },
    }),
    prisma.orderItem.count({
      where: { order: { customer: { email: { endsWith: "@demo.seed" } } } },
    }),
    prisma.order.count({
      where: { customer: { email: { endsWith: "@demo.seed" } } },
    }),
    prisma.product.count({ where: { sku: { startsWith: "DEMO-" } } }),
    prisma.customer.count({ where: { email: { endsWith: "@demo.seed" } } }),
    prisma.store.count({ where: { name: { startsWith: "Demo — " } } }),
    prisma.fxRate.count({
      where: {
        baseCurrency: { in: DEMO_CURRENCIES },
        quoteCurrency: { in: DEMO_CURRENCIES },
      },
    }),
  ]);
  const byTable = {
    inventoryMovements,
    orderItems,
    orders,
    products,
    customers,
    stores,
    fxRates,
  };
  const total = Object.values(byTable).reduce((a, b) => a + b, 0);
  return { total, byTable };
}

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

// ---------- Clear phase -----------------------------------------------------

/**
 * Deletes all rows this script has ever created. Never touches User rows,
 * Categories (shared/idempotent), or the smoke seed's data.
 *
 * Runs at the top level (outside $transaction) so each DELETE commits before
 * the next, respecting FK order.
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
  // tagged-template array-to-Postgres-array conversion. The date window
  // [now - (WINDOW_DAYS + 1) days, now] bounds the delete to the demo range;
  // combined with midnight-UTC it means we only touch rows this seed script
  // itself could have produced.
  const { Prisma } = require("../generated/prisma");
  const ccyList = Prisma.join(DEMO_CURRENCIES);
  const fxWindowStart = new Date(Date.now() - (WINDOW_DAYS + 1) * 86400 * 1000);
  const fxWindowEnd = new Date();
  const fxResult = await prisma.$executeRaw`
    DELETE FROM "FxRate"
    WHERE "baseCurrency" IN (${ccyList})
      AND "quoteCurrency" IN (${ccyList})
      AND "asOf" BETWEEN ${fxWindowStart} AND ${fxWindowEnd}
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
 *
 * The first LEGACY_POOL_SIZE customers get a synthetic firstOrderAt from
 * `legacyFirstOrderAt` (well before the window) so they always count as
 * Repeat regardless of which range the dashboard is viewing.
 */
async function backfillFirstOrderAt(prisma, customers, orders, rng, now) {
  const earliestByCustomerId = new Map();
  for (const o of orders) {
    const cur = earliestByCustomerId.get(o.customerId);
    if (!cur || o.placedAt < cur) earliestByCustomerId.set(o.customerId, o.placedAt);
  }

  // Force the legacy cohort's firstOrderAt to sit safely before every seeded
  // in-window order. Range: [WINDOW_DAYS + 180, WINDOW_DAYS + 730] days ago.
  for (let i = 0; i < Math.min(LEGACY_POOL_SIZE, customers.length); i++) {
    const c = customers[i];
    const daysBack = WINDOW_DAYS + randInt(rng, 180, 730);
    const legacy = new Date(now.getTime() - daysBack * 86400000);
    earliestByCustomerId.set(c.id, legacy);
  }

  await chunked(Array.from(earliestByCustomerId.entries()), 100, async (batch) => {
    await Promise.all(
      batch.map(([customerId, firstOrderAt]) =>
        prisma.customer.update({ where: { id: customerId }, data: { firstOrderAt } })
      )
    );
  });
}

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

// ---------- Module exports (for tests) ---------------------------------------

module.exports = {
  xfnv1a, mulberry32, randInt, pick, weightedPick, gaussian, chunked,
  parseArgs, computeCorrectiveMovements, assertInventoryInvariants,
  buildFxRates,
  runSeedDemo,
  projectedBatchRows,
  resolveMaxTotalRows,
  countDemoRows,
  DEFAULT_MAX_TOTAL_ROWS,
  WINDOW_DAYS,
  DEMO_CURRENCIES,
  NUM_CUSTOMERS,
  REPEAT_POOL_SIZE,
  LEGACY_POOL_SIZE,
};

// Auto-run only when invoked directly (not when required by tests / server actions).
if (require.main === module) {
  (async () => {
    const { PrismaPg } = require("@prisma/adapter-pg");
    const { PrismaClient } = require("../generated/prisma");
    const flags = parseArgs(process.argv);
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required");
    }
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter });
    try {
      const mode = flags.clear ? "clear" : flags.keep ? "keep" : "reseed";
      const summary = await runSeedDemo({ prisma, mode });
      printSummary(summary);
    } finally {
      await prisma.$disconnect();
    }
  })().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}

/**
 * Public entry point. Reusable from CLI or a Next.js server action.
 *
 * @param {Object} opts
 * @param {import("../generated/prisma").PrismaClient} opts.prisma
 * @param {"reseed"|"keep"|"clear"} opts.mode
 * @param {string=} opts.seedSuffix  Appended to SEED_RANDOM_SEED so callers
 *                                   (e.g. the UI "Add batch" button) can
 *                                   produce a different dataset per invocation
 *                                   while remaining deterministic per call.
 * @returns {Promise<Object>} summary; see docs/superpowers/specs/2026-07-02-admin-demo-data-tool-design.md §3.
 */
async function runSeedDemo({ prisma, mode, seedSuffix, maxTotalRows }) {
  if (mode !== "reseed" && mode !== "keep" && mode !== "clear") {
    throw new Error(`runSeedDemo: unknown mode "${mode}"`);
  }
  const t0 = Date.now();
  const ranAt = new Date(t0).toISOString();
  const flags = { clear: mode === "clear", keep: mode === "keep" };
  const seedString =
    (process.env.SEED_RANDOM_SEED || "react-dashboard-demo") +
    (seedSuffix ? `-${seedSuffix}` : "");

  const projected = projectedBatchRows();
  const max = maxTotalRows === undefined ? resolveMaxTotalRows() : maxTotalRows;
  const maxOrNull = Number.isFinite(max) ? max : null;

  const owner = await resolveOwner(prisma);
  console.log(`Owner: ${owner.email} (accountId=${owner.accountId})`);
  console.log(`Seed string: "${seedString}"`);

  // Snapshot the total demo footprint before we do anything. Used to (a)
  // decide whether to run and (b) report before/after in the summary.
  const demoRowsBefore = (await countDemoRows(prisma)).total;

  if (flags.keep) {
    // "Add batch" is the only path that grows the DB, so it's the only path
    // that needs a preflight guard. Reseed clears first, then inserts one
    // batch, which fits by construction (default max = 3 × batch).
    if (demoRowsBefore + projected > max) {
      const capLabel = Number.isFinite(max) ? max.toLocaleString() : "unlimited";
      throw new Error(
        `Demo row cap reached: ${demoRowsBefore.toLocaleString()} demo rows already ` +
          `in the database and the next batch would add ~${projected.toLocaleString()} more ` +
          `(cap = ${capLabel}). Run --clear (or the "Remove all demo data" button) first, ` +
          `or raise SEED_MAX_TOTAL_ROWS.`,
      );
    }
  }

  let clearedCounts = null;
  if (!flags.keep) {
    clearedCounts = await clearDemo(prisma);
  }

  if (flags.clear) {
    console.log("Clear-only mode: done.");
    return {
      mode,
      ranAt,
      durationMs: Date.now() - t0,
      seedString,
      cleared: {
        inventoryMovements: clearedCounts.movements,
        orderItems: clearedCounts.orderItems,
        orders: clearedCounts.orders,
        products: clearedCounts.products,
        customers: clearedCounts.customers,
        stores: clearedCounts.stores,
        fxRates: clearedCounts.fxRates,
      },
      inserted: null,
      capacity: {
        demoRowsBefore,
        demoRowsAfter: 0,
        projectedBatchRows: projected,
        maxTotalRows: maxOrNull,
      },
      _extra: null,
    };
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

  let stats;
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
      await backfillFirstOrderAt(tx, customers, allOrders, rng, now);

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

      stats = {
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
    { timeout: 300_000, maxWait: 15_000 }
  );

  return {
    mode,
    ranAt,
    durationMs: Date.now() - t0,
    seedString,
    cleared: clearedCounts
      ? {
          inventoryMovements: clearedCounts.movements,
          orderItems: clearedCounts.orderItems,
          orders: clearedCounts.orders,
          products: clearedCounts.products,
          customers: clearedCounts.customers,
          stores: clearedCounts.stores,
          fxRates: clearedCounts.fxRates,
        }
      : null,
    inserted: {
      stores: stats.stores,
      products: stats.products,
      customers: stats.customers,
      orders: stats.orders,
      orderItems: stats.orderItems,
      inventoryMovements: stats.movements,
      fxRates: stats.fxRates,
    },
    capacity: {
      demoRowsBefore,
      // For reseed: clear ran, so "before" for the write phase is really 0.
      // Reported "after" = what we just inserted. For keep: additive delta on
      // top of the pre-existing count (skipDuplicates makes stores/products/
      // customers/fx effectively zero-net, so we count only the growth rows).
      demoRowsAfter: flags.keep
        ? demoRowsBefore + stats.orders + stats.orderItems + stats.movements
        : stats.stores +
          stats.products +
          stats.customers +
          stats.orders +
          stats.orderItems +
          stats.movements +
          stats.fxRates,
      projectedBatchRows: projected,
      maxTotalRows: maxOrNull,
    },
    _extra: {
      productsByProfile: stats.productsByProfile,
      ordersByStatus: stats.ordersByStatus,
      categories: stats.categories,
      window: { from: stats.from, to: stats.to },
    },
  };
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

function formatCapacityLine(cap) {
  if (!cap) return null;
  const before = cap.demoRowsBefore.toLocaleString();
  const after = cap.demoRowsAfter.toLocaleString();
  const cap_ = cap.maxTotalRows == null ? "unlimited" : cap.maxTotalRows.toLocaleString();
  const projected = cap.projectedBatchRows.toLocaleString();
  return `  Capacity:    ${before} → ${after} of ${cap_} demo rows (batch projection: ${projected})`;
}

function printSummary(summary) {
  const elapsedSec = (summary.durationMs / 1000).toFixed(1);
  if (summary.mode === "clear") {
    const c = summary.cleared;
    console.log(`\nDemo clear complete (elapsed ${elapsedSec}s):`);
    console.log(
      `  Cleared: movements=${c.inventoryMovements}, orderItems=${c.orderItems}, ` +
        `orders=${c.orders}, products=${c.products}, customers=${c.customers}, ` +
        `stores=${c.stores}, fxRates=${c.fxRates}`
    );
    const capLine = formatCapacityLine(summary.capacity);
    if (capLine) console.log(capLine);
    console.log();
    return;
  }
  const s = summary.inserted;
  const extra = summary._extra;
  const storeLabels = STORES.map((x) => `${x.location} ${x.baseCurrency}`).join(", ");
  console.log(`\nDemo seed complete (seed="${summary.seedString}", elapsed ${elapsedSec}s):`);
  console.log(`  Stores:      ${s.stores} (${storeLabels})`);
  console.log(`  Categories:  ${extra.categories}`);
  console.log(
    `  Products:    ${s.products}  ` +
      `(${extra.productsByProfile.TOP} top-sellers, ${extra.productsByProfile.LOW} LOW, ` +
      `${extra.productsByProfile.CRITICAL} CRITICAL, ${extra.productsByProfile.HEALTHY} healthy)`
  );
  console.log(
    `  Customers:   ${s.customers}  ` +
      `(${REPEAT_POOL_SIZE} repeat pool, ${LEGACY_POOL_SIZE} legacy pre-window)`
  );
  console.log(
    `  Orders:      ${s.orders}  ` +
      `(PAID ${extra.ordersByStatus.PAID} / PENDING ${extra.ordersByStatus.PENDING} / ` +
      `REFUNDED ${extra.ordersByStatus.REFUNDED} / CANCELLED ${extra.ordersByStatus.CANCELLED})`
  );
  console.log(`  OrderItems:  ${s.orderItems}`);
  console.log(`  Movements:   ${s.inventoryMovements}`);
  console.log(
    `  FxRates:     ${s.fxRates}  ` +
      `(${DEMO_CURRENCIES.length}x${DEMO_CURRENCIES.length - 1} pairs x ${WINDOW_DAYS} days)`
  );
  console.log(
    `  Window:      ${extra.window.from.toISOString().slice(0, 10)} -> ${extra.window.to.toISOString().slice(0, 10)}`
  );
  const capLine = formatCapacityLine(summary.capacity);
  if (capLine) console.log(capLine);
  console.log();
  console.log("Open http://localhost:3000/dashboard to verify.");
}
