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
