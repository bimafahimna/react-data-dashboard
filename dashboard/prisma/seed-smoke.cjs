/**
 * One-off smoke data seed for Task 22 verification.
 *
 * Inserts a minimal but realistic dataset so every dashboard panel has
 * something to show: 1 store, 1 product (USD), 1 customer, 1 PAID order
 * placed today (for Daily view) and 1 placed ~10 days ago (for Weekly /
 * Monthly views), 2 inventory movements (one taking stock under the
 * reorder point so the low-stock alert fires), and 1 FX rate so the
 * USD->EUR currency switch works.
 *
 * Run with: node prisma/seed-smoke.cjs
 * Clean up with: node prisma/seed-smoke.cjs --clear
 */

require("dotenv").config({ path: ".env" });
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("../generated/prisma");

const SMOKE_TAG = "smoke-task-22"; // identifier we set on note fields / sku prefixes for easy cleanup

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const shouldClear = process.argv.includes("--clear");

  if (shouldClear) {
    console.log("Clearing previous smoke data...");
    await prisma.inventoryMovement.deleteMany({ where: { note: SMOKE_TAG } });
    await prisma.orderItem.deleteMany({
      where: { order: { customer: { email: "smoke@example.com" } } },
    });
    await prisma.order.deleteMany({ where: { customer: { email: "smoke@example.com" } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: "SMOKE-" } } });
    await prisma.customer.deleteMany({ where: { email: "smoke@example.com" } });
    await prisma.store.deleteMany({ where: { name: "Smoke Test Store" } });
    await prisma.category.deleteMany({ where: { name: "Smoke Apparel" } });
    await prisma.fxRate.deleteMany({ where: { baseCurrency: "USD", quoteCurrency: "EUR" } });
    console.log("Cleared.");
    await prisma.$disconnect();
    return;
  }

  // Find an existing user to own the store.
  const user = await prisma.user.findFirst({ orderBy: { accountId: "asc" } });
  if (!user) {
    console.error(
      "No User row found. Sign up at http://localhost:3000/signup first, then re-run this script."
    );
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`Owner: ${user.email} (accountId=${user.accountId})`);

  // Category
  const category = await prisma.category.upsert({
    where: { name: "Smoke Apparel" },
    create: { name: "Smoke Apparel" },
    update: {},
  });

  // Store
  const store = await prisma.store.upsert({
    where: {
      // No unique on (name, ownerId), so use a deterministic guard via findFirst
      id: -1,
    },
    create: {
      name: "Smoke Test Store",
      location: "Jakarta",
      baseCurrency: "USD",
      ownerId: user.accountId,
    },
    update: {},
  }).catch(async () => {
    // Fall back to find-or-create
    let s = await prisma.store.findFirst({
      where: { name: "Smoke Test Store", ownerId: user.accountId },
    });
    if (!s) {
      s = await prisma.store.create({
        data: {
          name: "Smoke Test Store",
          location: "Jakarta",
          baseCurrency: "USD",
          ownerId: user.accountId,
        },
      });
    }
    return s;
  });

  // Product
  const product = await prisma.product.upsert({
    where: { sku: "SMOKE-TEE-001" },
    create: {
      sku: "SMOKE-TEE-001",
      name: "Smoke Test Tee",
      categoryId: category.id,
      storeId: store.id,
      unitPriceCents: 2500, // $25
      reorderPoint: 5,
    },
    update: {},
  });

  // Customer
  const customerFirstOrderAt = new Date();
  customerFirstOrderAt.setUTCDate(customerFirstOrderAt.getUTCDate() - 12);
  const customer = await prisma.customer.upsert({
    where: { email: "smoke@example.com" },
    create: {
      email: "smoke@example.com",
      fullName: "Smoke Customer",
      firstOrderAt: customerFirstOrderAt,
    },
    update: {},
  });

  // Two PAID orders: one today (for daily view), one 12 days ago (for weekly/monthly view)
  const today = new Date();
  const earlier = new Date();
  earlier.setUTCDate(earlier.getUTCDate() - 12);

  // Order #1 (today) — 2 items
  const order1 = await prisma.order.create({
    data: {
      storeId: store.id,
      customerId: customer.id,
      status: "PAID",
      currency: "USD",
      totalCents: 5000, // 2 x $25
      placedAt: today,
      paidAt: today,
      items: {
        create: [
          {
            productId: product.id,
            quantity: 2,
            unitPriceCents: 2500,
            subtotalCents: 5000,
          },
        ],
      },
    },
  });

  // Order #2 (12 days ago) — 3 items
  const order2 = await prisma.order.create({
    data: {
      storeId: store.id,
      customerId: customer.id,
      status: "PAID",
      currency: "USD",
      totalCents: 7500, // 3 x $25
      placedAt: earlier,
      paidAt: earlier,
      items: {
        create: [
          {
            productId: product.id,
            quantity: 3,
            unitPriceCents: 2500,
            subtotalCents: 7500,
          },
        ],
      },
    },
  });

  // Inventory: +10 purchase 14 days ago, -8 in sales (2 + 3 from orders, plus a manual -3 adjustment
  // so stock ends at 2 — below reorderPoint=5 so the LOW-stock alert triggers).
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14);
  await prisma.inventoryMovement.createMany({
    data: [
      {
        storeId: store.id,
        productId: product.id,
        delta: 10,
        reason: "PURCHASE",
        note: SMOKE_TAG,
        occurredAt: fourteenDaysAgo,
      },
      {
        storeId: store.id,
        productId: product.id,
        delta: -3,
        reason: "SALE",
        orderId: order2.id,
        note: SMOKE_TAG,
        occurredAt: earlier,
      },
      {
        storeId: store.id,
        productId: product.id,
        delta: -2,
        reason: "SALE",
        orderId: order1.id,
        note: SMOKE_TAG,
        occurredAt: today,
      },
      {
        storeId: store.id,
        productId: product.id,
        delta: -3,
        reason: "ADJUSTMENT",
        note: SMOKE_TAG,
        occurredAt: today,
      },
    ],
  });

  // FX: USD -> EUR so the currency switcher in the UI has something to convert with
  await prisma.fxRate.upsert({
    where: {
      baseCurrency_quoteCurrency_asOf: {
        baseCurrency: "USD",
        quoteCurrency: "EUR",
        asOf: fourteenDaysAgo,
      },
    },
    create: {
      baseCurrency: "USD",
      quoteCurrency: "EUR",
      rate: 0.92,
      asOf: fourteenDaysAgo,
    },
    update: {},
  });

  console.log("\nSmoke data inserted:");
  console.log(`  Store:    ${store.name} (id=${store.id}, USD)`);
  console.log(`  Product:  ${product.name} (sku=${product.sku}, $25, reorder=5)`);
  console.log(`  Customer: ${customer.email}`);
  console.log(`  Order #1: today, $50 (2 units)`);
  console.log(`  Order #2: -12 days, $75 (3 units)`);
  console.log(`  Stock on hand: 2 (LOW, below reorder=5)`);
  console.log(`  FX: USD->EUR @ 0.92 as of 14 days ago`);
  console.log("\nOpen http://localhost:3000/dashboard to verify.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
