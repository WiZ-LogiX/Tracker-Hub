/**
 * Legacy quote_items VIEW — Drizzle model.
 *
 * 1:1 mirror of the quote_items table. Used by existing server functions,
 * the old configurator, tests, and PDF templates.
 *
 * When leaf data moves into units/components, this view will be rewritten
 * to UNION the new hierarchy back into the legacy shape.
 */
import { pgView } from "drizzle-orm/pg-core";
import {
  uuid,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export const legacyQuoteItems = pgView("legacy_quote_items", {
  id: uuid("id"),
  quoteId: uuid("quote_id"),
  productId: uuid("product_id"),
  productName: text("product_name"),
  materialId: uuid("material_id"),
  materialName: text("material_name"),
  finishId: uuid("finish_id"),
  finishName: text("finish_name"),
  dimensionValue: numeric("dimension_value", { precision: 10, scale: 3 }),
  qty: integer("qty"),
  accessories: jsonb("accessories"),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }),
  lineTotal: numeric("line_total", { precision: 14, scale: 2 }),
  breakdown: jsonb("breakdown"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  tenantId: uuid("tenant_id"),
}).existing();

export type LegacyQuoteItem = typeof legacyQuoteItems.$inferSelect;
