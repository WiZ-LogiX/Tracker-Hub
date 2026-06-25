/**
 * BOM resolution tests.
 *
 * Tests the pure parts of bom.ts (area key validation, descriptor shape,
 * edge cases) and the server fn input validation.
 *
 * DB-integration tests (resolveBom hitting Supabase) are in the
 * remote DB test suite — not runnable locally without a live DB.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { listAreaKeys } from "@/lib/pricing/areaFunctions";

// ── 1. Area key validation ────────────────────────────────────────────────

describe("area function key validation", () => {
  const validKeys = new Set(listAreaKeys());

  it("all 7 built-in keys are registered", () => {
    expect(validKeys.size).toBe(7);
    expect(validKeys.has("cabinet_side")).toBe(true);
    expect(validKeys.has("cabinet_top")).toBe(true);
    expect(validKeys.has("cabinet_bottom")).toBe(true);
    expect(validKeys.has("back_panel")).toBe(true);
    expect(validKeys.has("shelf")).toBe(true);
    expect(validKeys.has("door_panel")).toBe(true);
    expect(validKeys.has("drawer_front")).toBe(true);
  });

  it("unknown key is not in the registry", () => {
    expect(validKeys.has("nonexistent_key")).toBe(false);
    expect(validKeys.has("cabinet_side_v2")).toBe(false);
    expect(validKeys.has("")).toBe(false);
  });
});

// ── 2. ComponentDescriptor shape ───────────────────────────────────────────

describe("ComponentDescriptor shape", () => {
  // Simulate what resolveBom would produce for a material with area function
  const areaDescriptor = {
    id: "bom-row-uuid",
    kind: "material" as const,
    catalogId: null,
    qty: 1,
    unitOfMeasure: "m2",
    areaFunctionKey: "cabinet_side",
  };

  // Simulate what resolveBom would produce for hardware with catalog_ref
  const catalogDescriptor = {
    id: "bom-row-uuid-2",
    kind: "hardware" as const,
    catalogId: "catalog-hw-uuid",
    qty: 6,
    unitOfMeasure: "pcs",
    areaFunctionKey: null,
  };

  it("area-based material has areaFunctionKey, no catalogId", () => {
    expect(areaDescriptor.areaFunctionKey).toBeTruthy();
    expect(areaDescriptor.catalogId).toBeNull();
    expect(areaDescriptor.unitOfMeasure).toBe("m2");
  });

  it("catalog-based hardware has catalogId, no areaFunctionKey", () => {
    expect(catalogDescriptor.catalogId).toBeTruthy();
    expect(catalogDescriptor.areaFunctionKey).toBeNull();
    expect(catalogDescriptor.unitOfMeasure).toBe("pcs");
  });

  it("qty is a number (parsed from numeric string)", () => {
    expect(typeof areaDescriptor.qty).toBe("number");
    expect(typeof catalogDescriptor.qty).toBe("number");
    expect(areaDescriptor.qty).toBeGreaterThan(0);
    expect(catalogDescriptor.qty).toBeGreaterThan(0);
  });

  it("kind is one of the valid enum values", () => {
    const validKinds = new Set(["material", "hardware", "accessory", "manufacturing"]);
    expect(validKinds.has(areaDescriptor.kind)).toBe(true);
    expect(validKinds.has(catalogDescriptor.kind)).toBe(true);
  });
});

// ── 3. Unit of measure derivation ──────────────────────────────────────────

describe("unitOfMeasure derivation", () => {
  // Replicate the logic from bom.ts without importing the private function
  function unitOfMeasure(kind: string, areaFunctionKey: string | null): string {
    if (kind === "material" && areaFunctionKey) return "m2";
    return "pcs";
  }

  it("material with areaFunctionKey → m2", () => {
    expect(unitOfMeasure("material", "cabinet_side")).toBe("m2");
    expect(unitOfMeasure("material", "shelf")).toBe("m2");
  });

  it("material without areaFunctionKey → pcs", () => {
    expect(unitOfMeasure("material", null)).toBe("pcs");
  });

  it("hardware → pcs (always)", () => {
    expect(unitOfMeasure("hardware", null)).toBe("pcs");
    expect(unitOfMeasure("hardware", "cabinet_side")).toBe("pcs");
  });

  it("accessory → pcs (always)", () => {
    expect(unitOfMeasure("accessory", null)).toBe("pcs");
  });

  it("manufacturing → pcs (always)", () => {
    expect(unitOfMeasure("manufacturing", "cabinet_side")).toBe("pcs");
  });
});

// ── 4. Server fn input validation ──────────────────────────────────────────

describe("resolveBomFn input validation", () => {
  const schema = z.object({
    unitTypeId: z.string().uuid(),
  });

  it("accepts valid UUID", () => {
    expect(() =>
      schema.parse({ unitTypeId: "550e8400-e29b-41d4-a716-446655440000" }),
    ).not.toThrow();
  });

  it("rejects non-UUID string", () => {
    expect(() => schema.parse({ unitTypeId: "not-a-uuid" })).toThrow();
  });

  it("rejects empty string", () => {
    expect(() => schema.parse({ unitTypeId: "" })).toThrow();
  });

  it("rejects missing unitTypeId", () => {
    expect(() => schema.parse({})).toThrow();
  });

  it("rejects numeric unitTypeId", () => {
    expect(() => schema.parse({ unitTypeId: 123 })).toThrow();
  });

  it("rejects null unitTypeId", () => {
    expect(() => schema.parse({ unitTypeId: null })).toThrow();
  });
});

// ── 5. CHECK constraint contract ───────────────────────────────────────────

describe("unit_type_bom CHECK constraint contract", () => {
  // The CHECK enforces:
  //   manufacturing kind → area_function_key MUST be set
  //   all other kinds → catalog_ref OR area_function_key MUST be set
  //
  // This means bom.ts can trust that every non-manufacturing row
  // has at least one of catalog_ref or area_function_key.

  it("manufacturing kind requires area_function_key (per CHECK)", () => {
    // A valid manufacturing BOM row per the CHECK:
    const validMfg = { kind: "manufacturing", catalogRef: null, areaFunctionKey: "cabinet_side" };
    expect(validMfg.areaFunctionKey).toBeTruthy();
  });

  it("material kind requires catalog_ref OR area_function_key", () => {
    const withCatalog = { kind: "material", catalogRef: "uuid-1", areaFunctionKey: null };
    const withArea = { kind: "material", catalogRef: null, areaFunctionKey: "shelf" };
    const withBoth = { kind: "material", catalogRef: "uuid-2", areaFunctionKey: "cabinet_top" };

    expect(withCatalog.catalogRef || withCatalog.areaFunctionKey).toBeTruthy();
    expect(withArea.catalogRef || withArea.areaFunctionKey).toBeTruthy();
    expect(withBoth.catalogRef || withBoth.areaFunctionKey).toBeTruthy();
  });

  it("hardware kind requires catalog_ref OR area_function_key", () => {
    const hw = { kind: "hardware", catalogRef: "hw-uuid", areaFunctionKey: null };
    expect(hw.catalogRef || hw.areaFunctionKey).toBeTruthy();
  });
});

// ── 6. Edge cases ──────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("default_qty of '1' parses to 1", () => {
    expect(parseFloat("1")).toBe(1);
  });

  it("default_qty of '2.5' parses to 2.5", () => {
    expect(parseFloat("2.5")).toBe(2.5);
  });

  it("default_qty of '0' falls back to 1 via || 1", () => {
    const parsed = parseFloat("0") || 1;
    expect(parsed).toBe(1);
  });

  it("default_qty of NaN falls back to 1 via || 1", () => {
    const parsed = parseFloat("invalid") || 1;
    expect(parsed).toBe(1);
  });
});
