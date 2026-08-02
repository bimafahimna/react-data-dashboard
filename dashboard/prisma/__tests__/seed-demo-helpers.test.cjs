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
    expect(corr[0].note).toBe("demo-seed-v2 corrective");
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

const {
  buildFxRates,
  WINDOW_DAYS,
  DEMO_CURRENCIES,
} = require("../seed-demo.cjs");

describe("buildFxRates", () => {
  const now = new Date(Date.UTC(2026, 6, 1)); // Jul 1 2026 midnight UTC
  const NUM_PAIRS = DEMO_CURRENCIES.length * (DEMO_CURRENCIES.length - 1); // 5*4 = 20

  it("produces N*(N-1) pairs x WINDOW_DAYS rows", () => {
    const rng = mulberry32(xfnv1a("fx"));
    const rows = buildFxRates(rng, now);
    expect(rows).toHaveLength(NUM_PAIRS * WINDOW_DAYS);
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

const {
  runSeedDemo,
  projectedBatchRows,
  resolveMaxTotalRows,
  countDemoRows,
  DEFAULT_MAX_TOTAL_ROWS,
} = require("../seed-demo.cjs");

/**
 * Build a Prisma stub that supports the demo-cap counting path. Callers can
 * pass per-table counts (defaults to 0 everywhere).
 */
function makeStubPrisma(overrides) {
  const noopDelete = async () => ({ count: 0 });
  const tableCount = (key) => async () => (overrides?.counts?.[key] ?? 0);
  return {
    inventoryMovement: { deleteMany: noopDelete, count: tableCount("inventoryMovements") },
    orderItem: { count: tableCount("orderItems") },
    order: { deleteMany: noopDelete, count: tableCount("orders") },
    product: { deleteMany: noopDelete, count: tableCount("products") },
    customer: { deleteMany: noopDelete, count: tableCount("customers") },
    store: { deleteMany: noopDelete, count: tableCount("stores") },
    fxRate: { count: tableCount("fxRates") },
    user: { findFirst: async () => ({ accountId: 1, email: "stub@example.com" }) },
    $executeRaw: async () => 0,
  };
}

describe("projectedBatchRows", () => {
  it("returns a positive integer bounded above zero", () => {
    const n = projectedBatchRows();
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThan(0);
  });

  it("is stable across calls (pure function of module constants)", () => {
    expect(projectedBatchRows()).toBe(projectedBatchRows());
  });
});

describe("resolveMaxTotalRows", () => {
  it("returns 3× the projected batch as the default", () => {
    expect(resolveMaxTotalRows(undefined)).toBe(DEFAULT_MAX_TOTAL_ROWS);
    expect(DEFAULT_MAX_TOTAL_ROWS).toBe(3 * projectedBatchRows());
  });

  it("treats empty string, null, and '0' as default", () => {
    expect(resolveMaxTotalRows("")).toBe(DEFAULT_MAX_TOTAL_ROWS);
    expect(resolveMaxTotalRows(null)).toBe(DEFAULT_MAX_TOTAL_ROWS);
    expect(resolveMaxTotalRows("0")).toBe(DEFAULT_MAX_TOTAL_ROWS);
  });

  it("accepts positive integers verbatim", () => {
    expect(resolveMaxTotalRows("42")).toBe(42);
    expect(resolveMaxTotalRows("1000000")).toBe(1_000_000);
  });

  it("returns Infinity for 'unlimited' / 'none' / 'off' (case-insensitive)", () => {
    expect(resolveMaxTotalRows("unlimited")).toBe(Number.POSITIVE_INFINITY);
    expect(resolveMaxTotalRows("Unlimited")).toBe(Number.POSITIVE_INFINITY);
    expect(resolveMaxTotalRows("none")).toBe(Number.POSITIVE_INFINITY);
    expect(resolveMaxTotalRows("OFF")).toBe(Number.POSITIVE_INFINITY);
  });

  it("throws on garbage input", () => {
    expect(() => resolveMaxTotalRows("nope")).toThrow(/non-negative integer/);
    expect(() => resolveMaxTotalRows("-5")).toThrow(/non-negative integer/);
    expect(() => resolveMaxTotalRows("3.5")).toThrow(/non-negative integer/);
  });
});

describe("countDemoRows", () => {
  it("sums all seven tables in parallel", async () => {
    const prisma = makeStubPrisma({
      counts: {
        inventoryMovements: 100,
        orderItems: 50,
        orders: 20,
        products: 30,
        customers: 240,
        stores: 3,
        fxRates: 1840,
      },
    });
    const { total, byTable } = await countDemoRows(prisma);
    expect(byTable).toEqual({
      inventoryMovements: 100,
      orderItems: 50,
      orders: 20,
      products: 30,
      customers: 240,
      stores: 3,
      fxRates: 1840,
    });
    expect(total).toBe(100 + 50 + 20 + 30 + 240 + 3 + 1840);
  });

  it("returns zeros for a fresh DB", async () => {
    const { total, byTable } = await countDemoRows(makeStubPrisma());
    expect(total).toBe(0);
    for (const v of Object.values(byTable)) expect(v).toBe(0);
  });
});

describe("runSeedDemo", () => {
  it("is exported as a function", () => {
    expect(typeof runSeedDemo).toBe("function");
  });

  it("mode: 'clear' returns a summary with populated cleared, null inserted, and capacity", async () => {
    const stubPrisma = makeStubPrisma();
    const summary = await runSeedDemo({ prisma: stubPrisma, mode: "clear" });

    expect(summary.mode).toBe("clear");
    expect(typeof summary.ranAt).toBe("string");
    expect(typeof summary.durationMs).toBe("number");
    expect(typeof summary.seedString).toBe("string");
    expect(summary.seedString.length).toBeGreaterThan(0);
    expect(summary.cleared).toEqual({
      inventoryMovements: 0,
      orderItems: 0,
      orders: 0,
      products: 0,
      customers: 0,
      stores: 0,
      fxRates: 0,
    });
    expect(summary.inserted).toBeNull();
    expect(summary.capacity).toBeTruthy();
    expect(summary.capacity.demoRowsBefore).toBe(0);
    expect(summary.capacity.demoRowsAfter).toBe(0);
    expect(summary.capacity.projectedBatchRows).toBe(projectedBatchRows());
    expect(summary.capacity.maxTotalRows).toBe(DEFAULT_MAX_TOTAL_ROWS);
  });

  it("seedSuffix is appended to seedString", async () => {
    const stubPrisma = makeStubPrisma();
    const a = await runSeedDemo({ prisma: stubPrisma, mode: "clear", seedSuffix: "abc" });
    const b = await runSeedDemo({ prisma: stubPrisma, mode: "clear", seedSuffix: "xyz" });
    expect(a.seedString.endsWith("-abc")).toBe(true);
    expect(b.seedString.endsWith("-xyz")).toBe(true);
    expect(a.seedString).not.toBe(b.seedString);
  });

  it("throws on unknown mode", async () => {
    await expect(runSeedDemo({ prisma: {}, mode: "bogus" })).rejects.toThrow(/unknown mode/i);
  });

  it("keep mode: throws when current + projected would exceed the cap", async () => {
    // Simulate a DB that's already almost at the cap.
    const projected = projectedBatchRows();
    const cap = 2 * projected;
    const stubPrisma = makeStubPrisma({ counts: { orders: cap - Math.floor(projected / 2) } });

    await expect(
      runSeedDemo({ prisma: stubPrisma, mode: "keep", maxTotalRows: cap }),
    ).rejects.toThrow(/Demo row cap reached/);
  });

  it("keep mode: cap message names SEED_MAX_TOTAL_ROWS as the escape hatch", async () => {
    const projected = projectedBatchRows();
    const stubPrisma = makeStubPrisma({ counts: { orders: projected * 5 } });
    await expect(
      runSeedDemo({ prisma: stubPrisma, mode: "keep", maxTotalRows: projected }),
    ).rejects.toThrow(/SEED_MAX_TOTAL_ROWS/);
  });

  it("keep mode: unlimited cap never blocks the run (guard passes)", async () => {
    // We can't run the whole $transaction here (no real prisma), but if the
    // cap check would fire it fires before the tx opens. Confirm it doesn't
    // fire by observing that the failure now comes from the missing tx impl,
    // not from the cap.
    const projected = projectedBatchRows();
    const stubPrisma = makeStubPrisma({ counts: { orders: projected * 1000 } });
    await expect(
      runSeedDemo({ prisma: stubPrisma, mode: "keep", maxTotalRows: Number.POSITIVE_INFINITY }),
    ).rejects.not.toThrow(/Demo row cap reached/);
  });
});
