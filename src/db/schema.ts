// Drizzle schema — provider-agnostic Postgres definitions.
// Mirrors the production Supabase schema so Drizzle queries are typed
// end-to-end and a future provider swap is mechanical.
//
// IMPORTANT: This file is the source of truth for Drizzle TYPES only.
// Tables are created/altered via supabase--migration; keep this file in
// sync when migrations land. Do NOT run drizzle-kit push against the
// live database.
import {
  pgTable,
  uuid,
  text,
  boolean,
  numeric,
  integer,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ---------- Shared column helpers ----------
const id = () => uuid("id").primaryKey().defaultRandom();
const tenantId = () => uuid("tenant_id").notNull();
const companyId = () => uuid("company_id").notNull();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------- Catalog ----------
export const materials = pgTable("materials", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  type: text("type").notNull().default("wood"),
  unit: text("unit").notNull().default("m²"),
  pricePerUnit: numeric("price_per_unit").notNull().default("0"),
  wastagePct: numeric("wastage_pct"),
  supplierId: uuid("supplier_id"),
  countryOfOrigin: text("country_of_origin"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const materialVariants = pgTable("material_variants", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  materialId: uuid("material_id").notNull(),
  supplierId: uuid("supplier_id"),
  countryOfOrigin: text("country_of_origin"),
  pricePerUnit: numeric("price_per_unit").notNull().default("0"),
  currency: text("currency").notNull().default("EGP"),
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const finishes = pgTable("finishes", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  priceModifierPct: numeric("price_modifier_pct").notNull().default("0"),
  priceModifierFixed: numeric("price_modifier_fixed").notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const accessories = pgTable("accessories", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  unitPrice: numeric("unit_price").notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const categories = pgTable("categories", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  pricingUnit: text("pricing_unit").notNull().default("linear_meter"),
  createdAt: createdAt(),
});

export const products = pgTable("products", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  categoryId: uuid("category_id"),
  code: text("code").notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  descriptionAr: text("description_ar"),
  basePrice: numeric("base_price").notNull().default("0"),
  laborPct: numeric("labor_pct").notNull().default("15"),
  wastagePct: numeric("wastage_pct").notNull().default("8"),
  overheadPct: numeric("overhead_pct").notNull().default("10"),
  marginPct: numeric("margin_pct").notNull().default("25"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const productTemplates = pgTable("product_templates", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  categoryId: uuid("category_id"),
  code: text("code"),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  descriptionAr: text("description_ar"),
  basePrice: numeric("base_price").notNull().default("0"),
  defaultConfig: jsonb("default_config").notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

// ---------- Pricing ----------
export const pricingFactors = pgTable("pricing_factors", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  key: text("key").notNull(),
  labelAr: text("label_ar").notNull(),
  kind: text("kind").notNull(),
  scope: text("scope").notNull().default("global"),
  valuePct: numeric("value_pct").notNull().default("0"),
  valueFixed: numeric("value_fixed").notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const pricingRules = pgTable("pricing_rules", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  formula: jsonb("formula").notNull().default({}),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  createdAt: createdAt(),
});

export const discounts = pgTable("discounts", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  code: text("code").notNull(),
  type: text("type").notNull().default("percentage"),
  value: numeric("value").notNull(),
  maxValue: numeric("max_value"),
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
  usageCount: integer("usage_count").notNull().default(0),
  maxUses: integer("max_uses"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

// ---------- CRM ----------
export const customers = pgTable("customers", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  governorate: text("governorate"),
  address: text("address"),
  createdAt: createdAt(),
});

export const quoteRequests = pgTable("quote_requests", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  referenceNumber: text("reference_number").notNull(),
  customerId: uuid("customer_id"),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email"),
  governorate: text("governorate"),
  productCategory: text("product_category").notNull(),
  budgetRange: text("budget_range"),
  specs: jsonb("specs").notNull().default({}),
  notes: text("notes"),
  status: text("status").notNull().default("new"),
  createdAt: createdAt(),
});

// ---------- Quotes / Invoices / Orders ----------
export const quotes = pgTable("quotes", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  requestId: uuid("request_id"),
  customerId: uuid("customer_id").notNull(),
  createdBy: uuid("created_by"),
  subtotal: numeric("subtotal").notNull().default("0"),
  discountCode: text("discount_code"),
  discountAmount: numeric("discount_amount").notNull().default("0"),
  vatPct: numeric("vat_pct").notNull().default("14"),
  vatAmount: numeric("vat_amount").notNull().default("0"),
  total: numeric("total").notNull().default("0"),
  depositPct: numeric("deposit_pct").notNull().default("50"),
  validUntil: date("valid_until").notNull(),
  status: text("status").notNull().default("draft"),
  snapshot: jsonb("snapshot").notNull().default({}),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const quoteItems = pgTable("quote_items", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  quoteId: uuid("quote_id").notNull(),
  productId: uuid("product_id"),
  productName: text("product_name").notNull(),
  materialId: uuid("material_id"),
  materialName: text("material_name"),
  finishId: uuid("finish_id"),
  finishName: text("finish_name"),
  dimensionValue: numeric("dimension_value").notNull().default("1"),
  qty: integer("qty").notNull().default(1),
  unitPrice: numeric("unit_price").notNull().default("0"),
  lineTotal: numeric("line_total").notNull().default("0"),
  accessories: jsonb("accessories").notNull().default([]),
  breakdown: jsonb("breakdown").notNull().default({}),
  createdAt: createdAt(),
});

export const invoices = pgTable("invoices", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  invoiceNumber: text("invoice_number").notNull(),
  quoteId: uuid("quote_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  total: numeric("total").notNull(),
  depositAmount: numeric("deposit_amount").notNull().default("0"),
  paidAmount: numeric("paid_amount").notNull().default("0"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  snapshot: jsonb("snapshot").notNull().default({}),
});

export const orders = pgTable("orders", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  orderNumber: text("order_number").notNull(),
  quoteId: uuid("quote_id"),
  invoiceId: uuid("invoice_id"),
  customerId: uuid("customer_id").notNull(),
  total: numeric("total").notNull().default("0"),
  deposit: numeric("deposit").notNull().default("0"),
  contractDate: date("contract_date").notNull().defaultNow(),
  expectedDelivery: date("expected_delivery"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  currentStage: text("current_stage").notNull().default("deposit_received"),
  notes: text("notes"),
  createdAt: createdAt(),
});

// ---------- Configuration ----------
export const configurations = pgTable("configurations", {
  id: id(),
  tenantId: tenantId(),
  quoteItemId: uuid("quote_item_id"),
  templateId: uuid("template_id"),
  selections: jsonb("selections").notNull().default({}),
  dimensions: jsonb("dimensions").notNull().default({}),
  computedBreakdown: jsonb("computed_breakdown").notNull().default({}),
  pricingRuleVersion: integer("pricing_rule_version"),
  createdAt: createdAt(),
});

// ---------- Production ----------
export const productionAssignments = pgTable("production_assignments", {
  id: id(),
  tenantId: tenantId(),
  orderId: uuid("order_id").notNull(),
  workerId: uuid("worker_id"),
  stage: text("stage").notNull(),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const productionLogs = pgTable("production_logs", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  orderId: uuid("order_id").notNull(),
  stageFrom: text("stage_from"),
  stageTo: text("stage_to").notNull(),
  transitionedBy: uuid("transitioned_by"),
  transitionedAt: timestamp("transitioned_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
});

export const productionPhotos = pgTable("production_photos", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  orderId: uuid("order_id").notNull(),
  stage: text("stage"),
  photoUrl: text("photo_url").notNull(),
  caption: text("caption"),
  uploadedBy: uuid("uploaded_by"),
  createdAt: createdAt(),
});

export const qcInspections = pgTable("qc_inspections", {
  id: id(),
  tenantId: tenantId(),
  orderId: uuid("order_id").notNull(),
  stage: text("stage").notNull(),
  passed: boolean("passed").notNull().default(false),
  inspectorId: uuid("inspector_id"),
  notes: text("notes"),
  createdAt: createdAt(),
});

// ---------- Notifications / Ops ----------
export const notificationTemplates = pgTable("notification_templates", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  event: text("event").notNull(),
  channel: text("channel").notNull().default("whatsapp"),
  language: text("language").notNull().default("en"),
  subject: text("subject"),
  body: text("body").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const notificationLog = pgTable("notification_log", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  event: text("event").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  reference: text("reference"),
  channel: text("channel").notNull(),
  recipient: text("recipient"),
  status: text("status").notNull().default("pending"),
  payload: jsonb("payload").notNull().default({}),
  response: jsonb("response"),
  error: text("error"),
  createdAt: createdAt(),
});

export const internalNotes = pgTable("internal_notes", {
  id: id(),
  tenantId: tenantId(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  authorId: uuid("author_id"),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
  tenantId: tenantId(),
  companyId: companyId(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  details: jsonb("details").notNull().default({}),
  createdAt: createdAt(),
});

// ---------- Tenancy / Companies ----------
export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  settings: jsonb("settings").notNull().default({}),
  createdAt: createdAt(),
});

// ---------- Inferred types ----------
export type Material = typeof materials.$inferSelect;
export type NewMaterial = typeof materials.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type QuoteItem = typeof quoteItems.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type ProductionPhoto = typeof productionPhotos.$inferSelect;
export type NotificationLog = typeof notificationLog.$inferSelect;
