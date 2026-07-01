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
