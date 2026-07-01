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
