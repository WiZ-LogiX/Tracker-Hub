/**
 * Price history — append-only writes for catalog price versioning.
 *
 * Called from catalog update functions whenever a price-relevant field changes.
 * Pure async function (not a server function) — accepts a Supabase client
 * and tenantId as parameters.
 *
 * Append-only: only INSERTs, never UPDATEs or DELETEs (enforced by RLS + trigger).
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type PriceEntityType =
  | "material"
  | "hardware"
  | "accessory"
  | "manufacturing"
  | "veneer"
  | "finish";

// ── Core function ──────────────────────────────────────────────────────────

/**
 * Append a price change to the price_history table.
 *
 * Call this AFTER an update succeeds and the price has actually changed.
 * Non-blocking on failure — logs a warning but never throws, so catalog
 * updates are never blocked by price history writes.
 *
 * @param client  Supabase client (supabaseAdmin or context.supabase)
 * @param tenantId  Tenant UUID
 * @param entityType  One of material/hardware/accessory/manufacturing/veneer/finish
 * @param entityId  UUID of the catalog entity
 * @param price  New price value (numeric, in EGP or raw catalog unit)
 * @param effectiveFrom  Override timestamp (default: now)
 */
export async function recordPriceChange(
  client: any,
  tenantId: string,
  entityType: PriceEntityType,
  entityId: string,
  price: number,
  effectiveFrom?: Date,
): Promise<void> {
  if (!Number.isFinite(price) || price < 0) {
    console.warn(
      `[priceHistory] Skipping record for ${entityType}:${entityId} — invalid price ${price}`,
    );
    return;
  }

  const payload = {
    tenant_id: tenantId,
    entity_type: entityType,
    entity_id: entityId,
    price: String(price),
    effective_from: (effectiveFrom ?? new Date()).toISOString(),
  };

  const { error } = await client
    .from("price_history")
    .insert(payload);

  if (error) {
    // Non-blocking: log but don't throw
    console.warn(
      `[priceHistory] Failed to record price for ${entityType}:${entityId}: ${error.message}`,
    );
  }
}

// ── Helpers for catalog update functions ────────────────────────────────────

/**
 * Read the current price from a catalog table.
 * Returns null if the row doesn't exist or the price field is null.
 */
export async function readCatalogPrice(
  client: any,
  table: string,
  id: string,
  tenantId: string,
  priceField: string,
): Promise<number | null> {
  const { data, error } = await client
    .from(table)
    .select(priceField)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) return null;
  const raw = (data as any)[priceField];
  if (raw == null) return null;
  const num = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  return Number.isFinite(num) ? num : null;
}

/**
 * Record a price change if the price actually changed.
 * Reads the old price, compares, and appends to history if different.
 *
 * @returns true if a change was recorded
 */
export async function recordPriceChangeIfDifferent(
  client: any,
  tenantId: string,
  entityType: PriceEntityType,
  entityId: string,
  table: string,
  priceField: string,
  newPrice: number,
): Promise<boolean> {
  const oldPrice = await readCatalogPrice(client, table, entityId, tenantId, priceField);

  // Skip if price didn't change or old price is unreadable
  if (oldPrice === null || oldPrice === newPrice) return false;

  await recordPriceChange(client, tenantId, entityType, entityId, newPrice);
  return true;
}
