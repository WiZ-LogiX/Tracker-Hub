// Area functions for cabinet component material cost calculation.
// Each function takes dimensions in mm (w, h, d) and returns area in m².
// Pure — no DB, no side effects. Product-type logic lives here and nowhere else.
//
// KNOWN LIMITATION: Board-yield coefficients (panel_utilization, nesting_factor,
// cut_kernel_mm) are Egyptian-market defaults calibrated for 2440×1220 mm MDF/
// particle board panels with 4-6 mm nesting kerf. Different markets or panel
// sizes may require different coefficients. These are configurable per-tenant
// via catalog_material_variants.board_data JSONB — override there if needed.

export type AreaFn = (dims: { w: number; h: number; d: number }) => number;

function requirePositive(dims: { w: number; h: number; d: number }): void {
  const bad = ["w", "h", "d"].filter((k) => {
    const v = dims[k as keyof typeof dims];
    return typeof v !== "number" || !Number.isFinite(v) || v <= 0;
  });
  if (bad.length > 0) {
    throw new Error(
      `Non-positive dimension(s): ${bad.join(", ")}. All dimensions must be > 0.`,
    );
  }
}

// Registry — add new keys here to extend.
// Most values are in m² (input mm ÷ 1000 on each axis).
// Exception: edge_band returns linear metres (perimeter).

const registry: Record<string, AreaFn> = {
  // Two sides: w × h each.
  cabinet_side: ({ w, h }) => {
    requirePositive({ w, h, d: 1 });
    return (w / 1000) * (h / 1000);
  },

  // Top panel: w × d.
  cabinet_top: ({ w, d }) => {
    requirePositive({ w, d, h: 1 });
    return (w / 1000) * (d / 1000);
  },

  // Bottom panel: w × d.
  cabinet_bottom: ({ w, d }) => {
    requirePositive({ w, d, h: 1 });
    return (w / 1000) * (d / 1000);
  },

  // Back panel: full height × width.
  back_panel: ({ w, h }) => {
    requirePositive({ w, h, d: 1 });
    return (w / 1000) * (h / 1000);
  },

  // Shelf: w × d (sits inside, between sides — same footprint as top/bottom).
  shelf: ({ w, d }) => {
    requirePositive({ w, d, h: 1 });
    return (w / 1000) * (d / 1000);
  },

  // Door panel: w × h.
  door_panel: ({ w, h }) => {
    requirePositive({ w, h, d: 1 });
    return (w / 1000) * (h / 1000);
  },

  // Drawer front: w × h.
  drawer_front: ({ w, h }) => {
    requirePositive({ w, h, d: 1 });
    return (w / 1000) * (h / 1000);
  },

  // Edge banding: returns linear metres (perimeter of the panel).
  // The BOM controls which edges are actually banded via the component qty.
  // For example:
  //   - side panel: qty = h/1000 (2 vertical edges, top+bottom)
  //   - shelf/top:  qty = w/1000 (1 horizontal edge, front)
  //   - door:       qty = 2*(w+h)/1000 (all 4 edges)
  // The multiplier is set per BOM row, not in this function.
  edge_band: ({ w, h }) => {
    requirePositive({ w, h, d: 1 });
    return 2 * ((w / 1000) + (h / 1000));
  },
};

/** Compute area in m² for a given component type key. */
export function getArea(
  key: string,
  dims: { w: number; h: number; d: number },
): number {
  const fn = registry[key];
  if (!fn) {
    throw new Error(
      `Unknown area function key: "${key}". Available: ${Object.keys(registry).join(", ")}.`,
    );
  }
  requirePositive(dims);
  return fn(dims);
}

/** List all registered area function keys. */
export function listAreaKeys(): string[] {
  return Object.keys(registry);
}
