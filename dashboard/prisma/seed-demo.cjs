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

// ---------- Module exports (for tests) ---------------------------------------

module.exports = {
  xfnv1a, mulberry32, randInt, pick, weightedPick, gaussian, chunked,
  parseArgs,
};

// Auto-run main() only when invoked directly (not when required by tests).
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
