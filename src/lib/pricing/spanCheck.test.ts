import { describe, it, expect } from "vitest";
import {
  checkShelfSpan,
  getMaxSpanMm,
  listShelfMaterials,
  type ShelfMaterial,
} from "@/lib/pricing/spanCheck";

// ── checkShelfSpan ─────────────────────────────────────────────────────────

describe("checkShelfSpan", () => {
  it("returns ok for a short span within limits", () => {
    const result = checkShelfSpan({ spanMm: 400, widthMm: 600 });
    expect(result.ok).toBe(true);
    expect(result.severity).toBe("ok");
    expect(result.deflectionMm).toBeLessThan(result.maxDeflectionMm);
  });

  it("returns warning when deflection exceeds L/200 but stays under L/150", () => {
    // 1000 mm span, 600 mm wide, 18 mm thick particle board
    // deflection ≈ 3.47 mm; L/200 = 5 mm; L/150 = 6.67 mm → warning
    const result = checkShelfSpan({
      spanMm: 1000,
      widthMm: 600,
      material: "particle_board",
    });
    expect(result.severity).toBe("warning");
    expect(result.ok).toBe(false);
    expect(result.deflectionMm).toBeGreaterThan(0);
  });

  it("returns fail for a long span exceeding L/150", () => {
    // 1500 mm span — way beyond particle board capacity
    const result = checkShelfSpan({
      spanMm: 1500,
      widthMm: 600,
      material: "particle_board",
    });
    expect(result.severity).toBe("fail");
    expect(result.ok).toBe(false);
    expect(result.deflectionMm).toBeGreaterThan(result.maxDeflectionMm);
  });

  it("plywood handles longer spans than particle board", () => {
    const particleResult = checkShelfSpan({
      spanMm: 800,
      widthMm: 600,
      material: "particle_board",
    });
    const plywoodResult = checkShelfSpan({
      spanMm: 800,
      widthMm: 600,
      material: "plywood",
    });
    // Plywood deflects less
    expect(plywoodResult.deflectionMm).toBeLessThan(particleResult.deflectionMm);
  });

  it("thicker shelf deflects less", () => {
    const thin = checkShelfSpan({
      spanMm: 700,
      widthMm: 600,
      thicknessMm: 18,
    });
    const thick = checkShelfSpan({
      spanMm: 700,
      widthMm: 600,
      thicknessMm: 25,
    });
    expect(thick.deflectionMm).toBeLessThan(thin.deflectionMm);
  });

  it("wider shelf (greater depth) deflects less", () => {
    const narrow = checkShelfSpan({
      spanMm: 700,
      widthMm: 400,
    });
    const wide = checkShelfSpan({
      spanMm: 700,
      widthMm: 800,
    });
    expect(wide.deflectionMm).toBeLessThan(narrow.deflectionMm);
  });

  it("heavier load increases deflection", () => {
    const light = checkShelfSpan({
      spanMm: 700,
      widthMm: 600,
      loadNPerMm: 0.1,
    });
    const heavy = checkShelfSpan({
      spanMm: 700,
      widthMm: 600,
      loadNPerMm: 0.5,
    });
    expect(heavy.deflectionMm).toBeGreaterThan(light.deflectionMm);
  });

  it("messageKey matches severity", () => {
    const ok = checkShelfSpan({ spanMm: 300, widthMm: 600 });
    expect(ok.messageKey).toBe("spanCheck.ok");

    const fail = checkShelfSpan({
      spanMm: 1500,
      widthMm: 600,
      material: "particle_board",
    });
    expect(fail.messageKey).toBe("spanCheck.fail");
  });

  it("defaults to particle board when material not specified", () => {
    const withDefault = checkShelfSpan({ spanMm: 700, widthMm: 600 });
    const explicit = checkShelfSpan({
      spanMm: 700,
      widthMm: 600,
      material: "particle_board",
    });
    expect(withDefault.deflectionMm).toBe(explicit.deflectionMm);
  });

  it("maxDeflectionMm is span/200", () => {
    const result = checkShelfSpan({ spanMm: 1000, widthMm: 600 });
    expect(result.maxDeflectionMm).toBe(5); // 1000/200
  });
});

// ── getMaxSpanMm ───────────────────────────────────────────────────────────

describe("getMaxSpanMm", () => {
  it("returns 650 for particle board", () => {
    expect(getMaxSpanMm("particle_board")).toBe(650);
  });

  it("returns 825 for plywood", () => {
    expect(getMaxSpanMm("plywood")).toBe(825);
  });

  it("returns 900 for solid hardwood", () => {
    expect(getMaxSpanMm("solid_hardwood")).toBe(900);
  });

  it("defaults to particle board for unknown material", () => {
    expect(getMaxSpanMm("unknown" as ShelfMaterial)).toBe(650);
  });
});

// ── listShelfMaterials ─────────────────────────────────────────────────────

describe("listShelfMaterials", () => {
  it("returns 7 materials", () => {
    expect(listShelfMaterials()).toHaveLength(7);
  });

  it("includes particle_board and plywood", () => {
    const materials = listShelfMaterials();
    expect(materials).toContain("particle_board");
    expect(materials).toContain("plywood");
  });
});
