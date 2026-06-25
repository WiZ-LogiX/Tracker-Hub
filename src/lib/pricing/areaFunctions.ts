// Area functions for cabinet component material cost calculation.
// Each function takes dimensions in mm (w, h, d) and returns area in m².
// Pure — no DB, no side effects. Product-type logic lives here and nowhere else.

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
// All values are in m² (input mm ÷ 1000 on each axis).

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
