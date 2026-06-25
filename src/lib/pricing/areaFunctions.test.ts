import { describe, it, expect } from "vitest";
import { getArea, listAreaKeys } from "@/lib/pricing/areaFunctions";

// Base cabinet 600 × 720 × 600 mm (w × h × d)
const BASE = { w: 600, h: 720, d: 600 } as const;

const EXPECTED: Record<string, number> = {
  cabinet_side: 0.432, // 0.600 × 0.720
  cabinet_top: 0.36, // 0.600 × 0.600
  cabinet_bottom: 0.36, // 0.600 × 0.600
  back_panel: 0.432, // 0.600 × 0.720
  shelf: 0.36, // 0.600 × 0.600
  door_panel: 0.432, // 0.600 × 0.720
  drawer_front: 0.432, // 0.600 × 0.720
};

describe("areaFunctions", () => {
  describe("600×720×600 example", () => {
    for (const [key, expected] of Object.entries(EXPECTED)) {
      it(`${key} returns ${expected} m²`, () => {
        expect(getArea(key, BASE)).toBeCloseTo(expected, 6);
      });
    }
  });

  describe("unknown key", () => {
    it("throws descriptive error for unknown key", () => {
      expect(() => getArea("nonexistent", BASE)).toThrow(
        /Unknown area function key: "nonexistent"/,
      );
    });
  });

  describe("non-positive dimensions", () => {
    it.each(["w", "h", "d"] as const)("%s = 0 throws", (dim) => {
      expect(() => getArea("cabinet_side", { ...BASE, [dim]: 0 })).toThrow(
        /Non-positive dimension/,
      );
    });

    it.each(["w", "h", "d"] as const)("%s = -100 throws", (dim) => {
      expect(() => getArea("cabinet_side", { ...BASE, [dim]: -100 })).toThrow(
        /Non-positive dimension/,
      );
    });

    it("NaN throws", () => {
      expect(() =>
        getArea("cabinet_side", { ...BASE, w: Number.NaN }),
      ).toThrow(/Non-positive dimension/);
    });

    it("Infinity throws", () => {
      expect(() =>
        getArea("cabinet_side", { ...BASE, h: Infinity }),
      ).toThrow(/Non-positive dimension/);
    });
  });

  describe("property: area scales with the correct two dimensions", () => {
    // cabinet_side depends on w and h — doubling either doubles area.
    it("cabinet_side doubles when w doubles", () => {
      const a = getArea("cabinet_side", BASE);
      const b = getArea("cabinet_side", { ...BASE, w: BASE.w * 2 });
      expect(b).toBeCloseTo(a * 2, 10);
    });

    it("cabinet_side doubles when h doubles", () => {
      const a = getArea("cabinet_side", BASE);
      const b = getArea("cabinet_side", { ...BASE, h: BASE.h * 2 });
      expect(b).toBeCloseTo(a * 2, 10);
    });

    it("cabinet_side unchanged when d changes", () => {
      const a = getArea("cabinet_side", BASE);
      const b = getArea("cabinet_side", { ...BASE, d: BASE.d * 3 });
      expect(b).toBeCloseTo(a, 10);
    });

    // cabinet_top depends on w and d — doubling either doubles area.
    it("cabinet_top doubles when w doubles", () => {
      const a = getArea("cabinet_top", BASE);
      const b = getArea("cabinet_top", { ...BASE, w: BASE.w * 2 });
      expect(b).toBeCloseTo(a * 2, 10);
    });

    it("cabinet_top doubles when d doubles", () => {
      const a = getArea("cabinet_top", BASE);
      const b = getArea("cabinet_top", { ...BASE, d: BASE.d * 2 });
      expect(b).toBeCloseTo(a * 2, 10);
    });

    it("cabinet_top unchanged when h changes", () => {
      const a = getArea("cabinet_top", BASE);
      const b = getArea("cabinet_top", { ...BASE, h: BASE.h * 3 });
      expect(b).toBeCloseTo(a, 10);
    });

    // back_panel depends on w and h.
    it("back_panel doubles when w doubles", () => {
      const a = getArea("back_panel", BASE);
      const b = getArea("back_panel", { ...BASE, w: BASE.w * 2 });
      expect(b).toBeCloseTo(a * 2, 10);
    });

    it("back_panel unchanged when d changes", () => {
      const a = getArea("back_panel", BASE);
      const b = getArea("back_panel", { ...BASE, d: BASE.d * 3 });
      expect(b).toBeCloseTo(a, 10);
    });

    // shelf depends on w and d.
    it("shelf doubles when d doubles", () => {
      const a = getArea("shelf", BASE);
      const b = getArea("shelf", { ...BASE, d: BASE.d * 2 });
      expect(b).toBeCloseTo(a * 2, 10);
    });

    it("shelf unchanged when h changes", () => {
      const a = getArea("shelf", BASE);
      const b = getArea("shelf", { ...BASE, h: BASE.h * 3 });
      expect(b).toBeCloseTo(a, 10);
    });

    // door_panel depends on w and h.
    it("door_panel doubles when h doubles", () => {
      const a = getArea("door_panel", BASE);
      const b = getArea("door_panel", { ...BASE, h: BASE.h * 2 });
      expect(b).toBeCloseTo(a * 2, 10);
    });

    it("door_panel unchanged when d changes", () => {
      const a = getArea("door_panel", BASE);
      const b = getArea("door_panel", { ...BASE, d: BASE.d * 3 });
      expect(b).toBeCloseTo(a, 10);
    });

    // drawer_front depends on w and h.
    it("drawer_front doubles when w doubles", () => {
      const a = getArea("drawer_front", BASE);
      const b = getArea("drawer_front", { ...BASE, w: BASE.w * 2 });
      expect(b).toBeCloseTo(a * 2, 10);
    });

    it("drawer_front unchanged when d changes", () => {
      const a = getArea("drawer_front", BASE);
      const b = getArea("drawer_front", { ...BASE, d: BASE.d * 3 });
      expect(b).toBeCloseTo(a, 10);
    });
  });

  describe("extensibility", () => {
    it("listAreaKeys returns all 7 registered keys", () => {
      const keys = listAreaKeys();
      expect(keys).toHaveLength(7);
      expect(keys).toContain("cabinet_side");
      expect(keys).toContain("cabinet_top");
      expect(keys).toContain("cabinet_bottom");
      expect(keys).toContain("back_panel");
      expect(keys).toContain("shelf");
      expect(keys).toContain("door_panel");
      expect(keys).toContain("drawer_front");
    });
  });
});
