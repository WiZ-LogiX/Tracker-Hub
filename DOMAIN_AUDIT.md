# Domain Correctness Audit — Component-Driven Pricing System

**Date**: 2026-06-28
**Scope**: Tasks T1.1–T8.2 (hierarchy, unit_types + BOM, area_functions, catalog/finishes, engine-v3, snapshots, importer, reporting)
**Consultant skill**: `furniture-interior-design-consultant` (35+ years multidisciplinary furniture/joinery/manufacturing expertise)
**Verdict**: The system is a credible **quoting tool for the Egyptian cabinet/kitchen market** but has structural gaps that limit it beyond that scope.

---

## 1. Dimension Audit Table

| # | Dimension | Verdict | Evidence | Domain Reasoning |
|---|-----------|---------|----------|------------------|
| 1 | **Product taxonomy** | **RISK** | `rateCard.ts:122-139` (6 unit types), `areaFunctions.ts:22-64` (7 area fns) | The 6 unit types (base/upper/tall/drawer/corner_diagonal/corner_l) cover Egyptian kitchen cabinetry well. But the area functions are the **hard boundary**: 7 functions model only standard cabinet geometry (2 sides + top + bottom + back + shelf + door + drawer front). Doors (single-panel, 4-edge banding), tables (solid-wood top + legs), wardrobes with sliding systems, retail fixtures, and office furniture all need different geometric models. The unit_types table is data-extensible, but area_functions require code changes for non-cabinet geometries. |
| 2 | **Cut-list realism** | **RISK** | `areaFunctions.ts:22-64`, `componentAmount.ts:100-120`, `rateCard.ts:406-412` | Area functions compute simple W×H or W×D — no nesting optimization, no grain direction, no edge banding as a separate cost line. The consultant reference says edge banding is a distinct cost (linear metres × rate, 0.4–2.0mm PVC/ABS). The board-yield coefficient model (0.133/0.21/0.25 × board price) is a defensible **shortcut** that folds nesting waste + off-cuts into a single multiplier, but it doesn't account for board size (2440×1220 vs 2800×2070) or nesting efficiency (75–85% from CNC reference). For a **quoting tool** this is acceptable; for a **cut-list generator** it's insufficient. |
| 3 | **Finish & material logic** | **ADEQUATE** | `rateCard.ts:27-48`, `rateCard.ts:406-412` | The finish × width tiering matches how Egyptian workshops actually price: per-unit price per finish per width tier, imported from an Excel rate card. The 5 finish codes (HPL/PVC/GLOSS_MAX/POLYLAC/EGGER_ALVIC) cover the common Egyptian market. Board-yield coefficients per finish are market-specific but defensible. Width tiers (narrow <60cm, standard 60–90cm, wide >90cm) align with standard cabinet module widths. |
| 4 | **Manufacturing & labor** | **RISK** | `factors.ts:27-35`, `componentAmount.ts:172-199`, `rateCard.ts:206-208` | The cost build-up has: material + hardware + accessory + manufacturing (machining) + labor% + overhead% + margin%. The consultant reference lists 10 cost lines: material-panels, material-edge-banding, material-finishes, hardware, machining, labour, finishing (spray/lacquer), packaging, transport, installation, overhead+margin. **Missing explicit lines**: installation (نقل +2000 is a fee, not a per-unit cost), packaging, finishing (spray/lacquer booth time). These are hidden inside labor/margin percentages — acceptable for a quick quote but opaque for cost analysis. The fees_credits table captures نقل (delivery) and معاينة (site measurement) as fixed quote-level amounts, which is realistic for Egyptian workshops. |
| 5 | **Quotation workflow** | **ADEQUATE** | `quote.functions.ts:407-474` (freezeQuoteSnapshot), `quoteSnapshots.test.ts` | draft → sent → accepted with snapshot freezing on sent/accepted matches the real Egyptian workshop flow: client requests → quote created → sent via WhatsApp → client accepts → order + production. The design/3D step is outside the pricing system's scope (it's a separate workflow). Snapshot freezing captures pricing at commitment point — correct behavior. |
| 6 | **Configurability for new categories** | **GAP** | `areaFunctions.ts:22-64` (7 functions), `bom.ts:57-116` | To add doors: unit_types ✅ (data), BOM ✅ (data), finish ✅ (data), but **area_functions ❌ (code)**. A door needs a single w×h panel with 4-edge banding — the existing `door_panel` function computes w×h area correctly, but the BOM must model edge banding as separate components. To add tables/retail: need new area functions (table-top, leg, shelf-in-frame). The system is **data-extensible within cabinet geometry** but **code-extensible beyond it**. |
| 7 | **Pricing governance** | **ADEQUATE** | `factors.ts:27-35`, `factors.ts:76-112`, `factors.ts:194-234` | Factor order (subtotal→labor→overhead→complexity→rush→margin→luxury) is locked for audit trail. Factors are additive on base cost (not compounding) — mathematically equivalent but clearer for the workshop owner. VAT 14% is correct for Egypt. Discount clamped to subTotal prevents negative VAT base. Fees/credits are signed (+/-). This matches how Egyptian workshops negotiate: material cost → apply factory overhead → apply margin → apply complexity/rush → VAT → delivery fee. |

---

## 2. Prioritized Gap List

### Critical

**None.** The system works correctly for its primary use case (Egyptian kitchen/cabinet quoting).

### High

| Gap | Task ID | Recommendation | Status |
|-----|---------|----------------|--------|
| **Edge banding not modeled as separate cost line** | T3.1 (areaFunctions) | Add an `edge_band` area function type that computes linear metres (2×w + 2×h for a door, 2×h for a side panel). Store edge banding rate per linear metre in catalog. This lets the quote show edge banding as a visible cost line, matching the consultant's BOM template. | **✅ FIXED** — `edge_band` area function added (returns perimeter in linear metres). `edge_band` component kind added to `ComponentLike`, `ComponentDescriptor`, `ComponentInput`. `priceEdgeBand()` handler in `componentAmount.ts` computes `qty × perimeter × price`. `bom.ts` `unitOfMeasure()` returns `"m"` for edge_band kind. Migration `20260628_add_edge_band_kind.sql` adds enum value. 13 new tests. |
| **Installation/delivery hidden in fees_credits** | T4.1 (factors) | The fixed-amount fees (نقل +2000, معاينة -1000) are realistic for Egyptian workshops but don't scale with project size. Consider adding a `formulaKey` field that can reference "per_unit", "per_m2", or "fixed" — but this is a future enhancement, not a blocker. | **Documented as future enhancement** — fees_credits `formulaKey` field already exists in schema (currently always null). Implementation deferred until workshops request scalable fees. |

### Medium

| Gap | Task ID | Recommendation |
|-----|---------|----------------|
| **Wastage ref is areaFunctionKey, not catalog material** | T3.3 (componentAmount) | Wastage rules are keyed by area function (e.g., "cabinet_side"), not by material. This means you can't set different wastage for MDF vs plywood in the same position. For the Egyptian market this is usually fine (wastage is per-cut, not per-material), but it limits precision. **Recommendation**: document this as a known limitation; add material-scoped wastage as a future enhancement. |
| **Back panel uses same area as side panel** | T3.1 (areaFunctions) | `back_panel` computes w×h (correct area), but back panels are typically 6mm HDF while sides are 18mm MFC/MDF. The area is the same; the material cost difference is handled by the BOM (back panel references a different catalog material). **No code change needed** — just ensure BOM templates use the correct catalog material for backs. |
| **Board-yield coefficients are market-specific** | T7.1 (rateCard) | The 0.133/0.21/0.25 coefficients are derived from the April-2026 Egyptian rate card. They represent the ratio of usable part area to total board cost, folding in nesting waste + off-cuts. These are **not transferable** to other markets without recalibration. **Recommendation**: document coefficients as Egyptian-market defaults; allow per-tenant override in catalog_materials. |
| **Packaging not modeled** | T4.1 (factors) | The consultant reference lists packaging (cartons, foam, corner guards, film) as a separate cost line. Currently hidden inside labor/margin. For a quoting tool this is acceptable; for cost analysis it's a gap. **Recommendation**: add optional `packaging` factor in FACTOR_ORDER if workshops need to show it separately. |

### Low

| Gap | Task ID | Recommendation |
|-----|---------|----------------|
| **Shelf deflection not validated** | T3.1 (areaFunctions) | The consultant reference has shelf span tables (max 600–700mm for particle board, 750–900mm for plywood). The pricing system doesn't flag when a shelf span exceeds structural limits. This is a **design validation** concern, not a pricing concern. **Recommendation**: add optional span-check in TreeConfigurator UI (display warning when shelf width > material max span). |
| **Grain direction not modeled** | T3.1 (areaFunctions) | The CNC reference says "lock grain direction per part before nesting (decor panels)." The pricing system doesn't track grain direction. For a quoting tool this is irrelevant; for cut-list generation it matters. **Recommendation**: add `grainDirection` field to ComponentInput as future enhancement. |
| **Fees/credits formulaKey always null** | T4.1 (factors) | Real workshops might have delivery fees that scale with distance or volume. The current model only supports fixed amounts. **Recommendation**: implement formulaKey evaluation as future enhancement (e.g., "per_unit" × qty, "per_m2" × total area). |
| **No premium/balanced/budget options** | T3.3 (componentAmount) | The consultant reference says "when budget is a variable, present premium / balanced / budget options." The pricing system computes one price. **Recommendation**: this is a UI concern — the TreeConfigurator could offer "good/better/best" variants by swapping catalog materials. Not a pricing engine change. |

---

## 3. Reality-Check: 3 Example Units

### Example 1: 600mm Base Cabinet (Standard Kitchen Unit)

**Real dimensions**: w=600, h=720, d=600mm
**Real components** (from consultant BOM template):
- 2× side panels (18mm MFC, 600×720)
- 1× top panel (18mm MFC, 600×600)
- 1× bottom panel (18mm MFC, 600×600)
- 1× back panel (6mm HDF, 600×720)
- 2–3× shelves (18mm MFC, adjustable)
- 2× hinges (Blum CLIP top BLUMOTION)
- 1× handle
- Edge banding: 2×h (sides) + 2×w (top/bottom) = 2×720 + 2×600 = 2640mm linear

**Current system pricing**:
- Side-L: `cabinet_side` → 0.600 × 0.720 = 0.432 m² × material price ✅
- Side-R: same ✅
- Top: `cabinet_top` → 0.600 × 0.600 = 0.36 m² ✅
- Bottom: same ✅
- Back: `back_panel` → 0.600 × 0.720 = 0.432 m² ✅ (area correct, material should be thinner/cheaper)
- Hinges: 2 × price_per_piece ✅
- Handle: 1 × price_per_piece ✅

**What a real estimator would dispute**:
- ✅ **Edge banding now visible** — the `edge_band` component kind computes perimeter in linear metres and prices by the rate card's edge banding rate per metre. The BOM defines which edges to band (sides: 2×h, top/bottom: 2×w, shelves: 2×w) with qty representing linear metres per component.
- ⚠️ **Shelf count not from BOM** — the system uses whatever the BOM defines. A real estimator expects 2 adjustable shelves for a 720mm base cabinet. The BOM must be correct.
- ✅ **Area calculations are correct** for standard cabinet geometry.

### Example 2: L-Corner Base Cabinet (900×900mm)

**Real dimensions**: w=900, h=720, d=900mm (L-shaped)
**Real components**:
- 2× side panels (one short, one long)
- 1× top panel (L-shaped or 2 pieces)
- 1× bottom panel (L-shaped or 2 pieces)
- 1× back panel (2 pieces or L-shaped)
- Shelves
- Hardware

**Current system pricing**:
- The rate card imports `corner_l` as a fixed-price unit (no width tier, `isFixed: true`)
- `widthToTier(90) = "wide"` for corner_l in Лист1 data
- The system prices corner units as a **fixed amount from the rate card**, not by component area

**What a real estimator would dispute**:
- ✅ **Fixed pricing for corners is realistic** — Egyptian workshops quote corners as a flat rate because the L-shape geometry is complex and varies by installation. The rate card approach is correct.
- ⚠️ **But the BOM for a corner unit should still list components** — if the user builds a corner unit from unit_types, the BOM must include the correct number of panels. The area functions don't model L-shapes, so the BOM must use multiple rectangular panels.

### Example 3: 2400mm Wardrobe (Sliding Door)

**Real dimensions**: w=2400, h=2200, d=600mm
**Real components**:
- 2× side panels (18mm MFC, 2400×2200 — or 2 pieces if >2440mm sheet)
- 1× top panel (18mm MFC, 2400×600)
- 1× bottom panel (18mm MFC, 2400×600)
- 1× back panel (6mm HDF, 2400×2200 — or 2 pieces)
- 4–6× shelves (18mm MFC)
- 2× sliding door tracks (Hettich TopLine or Hawa Junior)
- 2× sliding doors (18mm MFC or glass)
- Internal: pull-out trouser rack, valet rod, shoe rack
- Wall anchoring bracket

**Current system pricing**:
- Side: `cabinet_side` → 2.400 × 2.200 = 5.28 m² ✅
- Top: `cabinet_top` → 2.400 × 0.600 = 1.44 m² ✅
- Bottom: same ✅
- Back: `back_panel` → 2.400 × 2.200 = 5.28 m² ✅
- Sliding track: catalog_hardware (price_per_piece) ✅
- Sliding doors: catalog_materials (m2 pricing) ✅
- Internal accessories: catalog_accessories ✅

**What a real estimator would dispute**:
- ❌ **Sheet size limitation not handled** — a 2200mm tall side panel exceeds the standard 2440mm sheet length. The workshop may need to use a 2800×2070 sheet or join two pieces. The pricing system doesn't account for this.
- ❌ **Wall anchoring not modeled** — the consultant reference says "always wall-fix at top rail" for tall wardrobes. This is a hardware component (bracket + fixings) that should be in the BOM.
- ⚠️ **Internal accessories vary widely** — pull-out racks, valet rods, shoe racks are optional and expensive. The system can model them as catalog_accessories, but the BOM must be comprehensive.

---

## 4. Product-Type Assumption Leaks (Outside area_functions)

The design contract says "area functions are the ONLY place product-type logic leaks into the engine." Let me verify this.

**Checking for leaks**:

1. **`componentAmount.ts:184-198`** — manufacturing rate_unit switch: `piece`, `minute`, `m`, `m2`. This is **not** a product-type leak — it's a generic pricing strategy selector. A manufacturing operation can be priced by any of these units regardless of product type. ✅

2. **`rateCard.ts:130-139`** — UNIT_TYPE_LABELS maps Arabic labels to slugs (base/upper/tall/drawer/corner_diagonal/corner_l). This is **rate-card-specific** parsing, not engine logic. The engine doesn't know about these slugs. ✅

3. **`rateCard.ts:194-209`** — ADDON_CATEGORIES classifies hardware/accessory/fee. This is **import-specific**, not engine logic. ✅

4. **`bom.ts:39-45`** — `unitOfMeasure` function: if `kind === "material" && areaFunctionKey` → "m2", if `kind === "edge_band"` → "m", else "pcs". This correctly handles edge banding as linear metres. **Verdict: fixed, no remaining leak**.

5. **`factors.ts:27-35`** — FACTOR_ORDER includes "luxury" and "complexity" — these are **Egyptian-market-specific** factor names. A workshop in another market might not use these. But they're data-driven (tenant_pricing_factors), so they can be set to 0%. ✅

6. **`engine-v3.ts:220-298`** — `priceUnit` function: passes `unit.widthMm, heightMm, depthMm` as `dims` to all component pricing. This is **correct** — the unit dimensions are used by area functions to compute area. No product-type assumption. ✅

**Conclusion**: The only minor leak is `bom.ts:39-45` (unitOfMeasure assumption). All other product-type logic is correctly encapsulated in area_functions or is import-specific parsing. The design contract is **mostly respected**.

---

## 5. Summary

The system is a **credible quoting tool for the Egyptian cabinet/kitchen market**. It correctly models:
- Standard cabinet geometry (sides, top, bottom, back, shelves, doors, drawer fronts)
- **Edge banding as a separate cost line** (linear metres × rate, visible in quote)
- Finish × width tiering (matches Egyptian rate card structure)
- Board-yield coefficients (market-specific but defensible)
- Per-unit factor overrides (labor, margin, complexity, rush)
- Quote-level VAT, discount, fees/credits
- Snapshot freezing on state transitions

The main risks are:
1. ~~**Edge banding not visible** as a separate cost line~~ **✅ FIXED** — edge_band component kind with perimeter pricing
2. **Installation/packaging not modeled** as separate cost lines (hidden in labor/margin)
3. **New categories beyond cabinet geometry require code changes** (area_functions)
4. **Board-yield coefficients are market-specific** (not transferable)

None of these are blockers for the Egyptian kitchen/cabinet use case. They become blockers if the platform expands to doors, tables, retail fixtures, or international markets.

---

## 6. Implemented Fixes (2026-06-28)

### Edge Banding (High-priority fix)

**Problem**: Edge banding was hidden in the rate card's per-unit price (~8–15% of material cost for a kitchen). Real workshops track edge banding as a separate cost line.

**Solution**: Added `edge_band` as a new component kind:

1. **`areaFunctions.ts`**: New `edge_band` function returns perimeter in linear metres: `2 × (w/1000 + h/1000)`
2. **`componentAmount.ts`**: New `priceEdgeBand()` handler: `qty × perimeter × pricePerUnit`, with wastage support
3. **`bom.ts`**: `unitOfMeasure()` returns `"m"` for edge_band kind (was the domain audit's minor leak)
4. **Type extensions**: `ComponentLike.kind`, `ComponentDescriptor.kind`, `ComponentInput.kind`, `UnitEditor kind`, `TreeConfigurator kind` all include `"edge_band"`
5. **Schema**: `componentKindEnum` in `schema.ts` includes `"edge_band"`
6. **Migration**: `20260628_add_edge_band_kind.sql` adds `edge_band` to the PostgreSQL enum

**How it works in practice**: The BOM defines edge banding components per unit type. For example, a 600mm base cabinet BOM would include:
- Edge band for sides: `qty = 2 × 0.720 = 1.44 m` (2 vertical edges)
- Edge band for top: `qty = 0.600 m` (1 horizontal edge, front)
- Edge band for shelves: `qty = 2 × 0.600 = 1.20 m` (2 shelves × front edge)

Each edge band component references a catalog material (e.g., "PVC 2mm white") with `pricePerUnit` in EGP/metre.

**Tests**: 13 new tests across `areaFunctions.test.ts` and `componentAmount.test.ts`. Total: 541 tests, all passing.
