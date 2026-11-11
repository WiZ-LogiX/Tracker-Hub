import {
  pgTable,
  uuid,
  text,
  boolean,
  bigint,
  integer,
  numeric,
  jsonb,
  date,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Enums ──────────────────────────────────────────────────────────────────

export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "converted",
]);

export const requestStatusEnum = pgEnum("request_status", [
  "new",
  "in_review",
  "quoted",
  "closed",
]);

export const orderStageEnum = pgEnum("order_stage", [
  "deposit_received",
  "design_approved",
  "cutting",
  "assembly",
  "finishing",
  "quality_check",
  "ready_for_pickup",
  "delivered",
  "completed",
]);

export const discountTypeEnum = pgEnum("discount_type", [
  "percentage",
  "fixed",
]);

export const pricingUnitEnum = pgEnum("pricing_unit", [
  "piece",
  "m",
  "m2",
  "minute",
  // Legacy values kept for backward compat
  "linear_meter",
  "square_meter",
  "unit",
]);

// modifier_type enum removed — catalog_finishes now uses price_per_unit

export const manufacturingRateUnitEnum = pgEnum("manufacturing_rate_unit", [
  "piece",
  "m",
  "m2",
  "minute",
]);

export const pricingFactorKeyEnum = pgEnum("pricing_factor_key", [
  "labor",
  "overhead",
  "margin",
  "luxury",
  "complexity",
  "rush",
  "wastage",
]);

export const wastageScopeEnum = pgEnum("wastage_scope", [
  "material",
  "material_type",
]);

export const feeSignEnum = pgEnum("fee_sign", [
  "plus",
  "minus",
]);

export const widthTierEnum = pgEnum("width_tier", [
  "narrow",
  "standard",
  "wide",
  "extra_wide",
]);

// ── Helpers ────────────────────────────────────────────────────────────────

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

function tenantIdx(name: string) {
  return index(name);
}

// ── Auth / User tables (no tenant_id) ─────────────────────────────────────
// FK to auth.users(id) is created in SQL migrations (Supabase owns auth schema).
// Drizzle cannot statically point at auth schemas without a real table ref.

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull(),
  },
  (t) => [uniqueIndex("user_roles_user_id_role_unique").on(t.userId, t.role)],
);

// ── Tenancy tables ─────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color"),
  taxNumber: text("tax_number"),
  commercialRegistry: text("commercial_registry"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  currency: text("currency").notNull().default("EGP"),
  taxRate: numeric("tax_rate").notNull().default("14"),
  plan: text("plan").notNull().default("free"),
  status: text("status").notNull().default("active"),
  featureFlags: jsonb("feature_flags").notNull().default("{}"),
  ...timestamps,
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tenant_members_tenant_user_unique").on(t.tenantId, t.userId),
    index("idx_tenant_members_user").on(t.userId),
    index("idx_tenant_members_tenant").on(t.tenantId),
  ],
);

export const appUsers = pgTable(
  "app_users",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    avatarKey: text("avatar_key"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("app_users_username_idx").on(t.username)],
);

// ── Business tables (tenant-scoped) ────────────────────────────────────────

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    governorate: text("governorate"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("customers_tenant_id_idx").on(t.tenantId),
    index("customers_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
    index("customers_tenant_name_idx").on(t.tenantId, t.name),
    index("customers_tenant_phone_idx").on(t.tenantId, t.phone),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    pricingUnit: text("pricing_unit").notNull().default("linear_meter"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("categories_tenant_id_idx").on(t.tenantId),
    index("categories_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    type: text("type").notNull().default("wood"),
    pricePerUnit: numeric("price_per_unit", { precision: 12, scale: 2 }).notNull().default("0"),
    unit: text("unit").notNull().default("m²"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
    supplierId: uuid("supplier_id"),
    countryOfOrigin: text("country_of_origin"),
    wastagePct: numeric("wastage_pct"),
  },
  (t) => [
    index("materials_tenant_id_idx").on(t.tenantId),
    index("materials_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const materialVariants = pgTable(
  "material_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialId: uuid("material_id").notNull(),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    countryOfOrigin: text("country_of_origin"),
    pricePerUnit: numeric("price_per_unit").notNull().default("0"),
    currency: text("currency").notNull().default("EGP"),
    validFrom: date("valid_from").notNull().default(new Date().toISOString().slice(0, 10)),
    validTo: date("valid_to"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("material_variants_tenant_id_idx").on(t.tenantId),
    index("idx_mv_material").on(t.materialId),
    index("idx_mv_supplier").on(t.supplierId),
  ],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    country: text("country"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("suppliers_tenant_id_idx").on(t.tenantId),
    index("suppliers_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const finishes = pgTable(
  "finishes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    priceModifierPct: numeric("price_modifier_pct", { precision: 6, scale: 2 }).notNull().default("0"),
    priceModifierFixed: numeric("price_modifier_fixed", { precision: 12, scale: 2 }).notNull().default("0"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("finishes_tenant_id_idx").on(t.tenantId),
    index("finishes_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const veneers = pgTable(
  "veneers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    pricePerM2: numeric("price_per_m2").notNull().default("0"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("veneers_tenant_id_idx").on(t.tenantId),
    index("veneers_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const accessories = pgTable(
  "accessories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("accessories_tenant_id_idx").on(t.tenantId),
    index("accessories_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    descriptionAr: text("description_ar"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull().default("0"),
    laborPct: numeric("labor_pct", { precision: 6, scale: 2 }).notNull().default("15"),
    wastagePct: numeric("wastage_pct", { precision: 6, scale: 2 }).notNull().default("8"),
    overheadPct: numeric("overhead_pct", { precision: 6, scale: 2 }).notNull().default("10"),
    marginPct: numeric("margin_pct", { precision: 6, scale: 2 }).notNull().default("25"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("products_tenant_id_idx").on(t.tenantId),
    index("products_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const productTemplates = pgTable(
  "product_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id"),
    code: text("code"),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    descriptionAr: text("description_ar"),
    basePrice: numeric("base_price").notNull().default("0"),
    defaultConfig: jsonb("default_config").notNull().default({}),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("product_templates_tenant_id_idx").on(t.tenantId),
    index("product_templates_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const pricingFactors = pgTable(
  "pricing_factors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    labelAr: text("label_ar").notNull(),
    kind: text("kind").notNull(),
    valuePct: numeric("value_pct").notNull().default("0"),
    valueFixed: numeric("value_fixed").notNull().default("0"),
    scope: text("scope").notNull().default("global"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("pricing_factors_tenant_id_idx").on(t.tenantId),
    index("pricing_factors_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"),
    formula: jsonb("formula").notNull().default({}),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("pricing_rules_tenant_id_idx").on(t.tenantId),
    index("pricing_rules_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const quoteRequests = pgTable(
  "quote_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referenceNumber: text("reference_number").notNull().unique(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    governorate: text("governorate"),
    productCategory: text("product_category").notNull(),
    specs: jsonb("specs").notNull().default({}),
    notes: text("notes"),
    budgetRange: text("budget_range"),
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("quote_requests_tenant_id_idx").on(t.tenantId),
    index("quote_requests_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteNumber: text("quote_number").notNull().unique(),
    requestId: uuid("request_id").references(() => quoteRequests.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("draft"),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    discountCode: text("discount_code"),
    vatPct: numeric("vat_pct", { precision: 5, scale: 2 }).notNull().default("14"),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    depositPct: numeric("deposit_pct", { precision: 5, scale: 2 }).notNull().default("50"),
    validUntil: date("valid_until").notNull(),
    notes: text("notes"),
    snapshot: jsonb("snapshot").notNull().default({}),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("quotes_tenant_id_idx").on(t.tenantId),
    index("quotes_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
    index("quotes_tenant_status_idx").on(t.tenantId, t.status),
    index("quotes_tenant_customer_idx").on(t.tenantId, t.customerId),
  ],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    productName: text("product_name").notNull(),
    materialId: uuid("material_id").references(() => materials.id, { onDelete: "set null" }),
    materialName: text("material_name"),
    finishId: uuid("finish_id").references(() => finishes.id, { onDelete: "set null" }),
    finishName: text("finish_name"),
    dimensionValue: numeric("dimension_value", { precision: 10, scale: 3 }).notNull().default("1"),
    qty: integer("qty").notNull().default(1),
    accessories: jsonb("accessories").notNull().default("[]"),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull().default("0"),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull().default("0"),
    breakdown: jsonb("breakdown").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("quote_items_tenant_id_idx").on(t.tenantId),
    index("quote_items_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceNumber: text("invoice_number").notNull().unique(),
    quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    depositAmount: numeric("deposit_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    snapshot: jsonb("snapshot").notNull().default({}),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("invoices_tenant_id_idx").on(t.tenantId),
    index("invoices_tenant_id_created_at_idx").on(t.tenantId, t.issuedAt),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull().unique(),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    currentStage: text("current_stage").notNull().default("deposit_received"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    deposit: numeric("deposit", { precision: 14, scale: 2 }).notNull().default("0"),
    contractDate: date("contract_date").notNull(),
    expectedDelivery: date("expected_delivery"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("orders_tenant_id_idx").on(t.tenantId),
    index("orders_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const discounts = pgTable(
  "discounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    type: text("type").notNull().default("percentage"),
    value: numeric("value", { precision: 10, scale: 2 }).notNull(),
    maxValue: numeric("max_value", { precision: 12, scale: 2 }),
    validFrom: date("valid_from").notNull().default(new Date().toISOString().slice(0, 10)),
    validTo: date("valid_to"),
    usageCount: integer("usage_count").notNull().default(0),
    maxUses: integer("max_uses"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("discounts_tenant_id_idx").on(t.tenantId),
    index("discounts_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const productionLogs = pgTable(
  "production_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    stageFrom: text("stage_from"),
    stageTo: text("stage_to").notNull(),
    transitionedAt: timestamp("transitioned_at", { withTimezone: true }).notNull().defaultNow(),
    transitionedBy: uuid("transitioned_by"),
    notes: text("notes"),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("production_logs_tenant_id_idx").on(t.tenantId),
    index("production_logs_tenant_id_created_at_idx").on(t.tenantId, t.transitionedAt),
  ],
);

export const productionPhotos = pgTable(
  "production_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    stage: text("stage"),
    photoUrl: text("photo_url").notNull(),
    caption: text("caption"),
    uploadedBy: uuid("uploaded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [index("idx_production_photos_order").on(t.orderId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    action: text("action").notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("audit_log_tenant_id_idx").on(t.tenantId),
    index("audit_log_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const workers = pgTable(
  "workers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    role: text("role"),
    phone: text("phone"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("workers_tenant_id_idx").on(t.tenantId),
    index("workers_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const productionAssignments = pgTable(
  "production_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    workerId: uuid("worker_id").references(() => workers.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull().default("pending"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("production_assignments_tenant_id_idx").on(t.tenantId),
    index("production_assignments_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const qcInspections = pgTable(
  "qc_inspections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    passed: boolean("passed").notNull().default(false),
    notes: text("notes"),
    inspectorId: uuid("inspector_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("qc_inspections_tenant_id_idx").on(t.tenantId),
    index("qc_inspections_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const remakes = pgTable(
  "remakes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
    remakeNumber: text("remake_number").notNull(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    qcInspectionId: uuid("qc_inspection_id").references(() => qcInspections.id, { onDelete: "set null" }),
    componentId: uuid("component_id").references(() => components.id, { onDelete: "set null" }),
    type: text("type").notNull().default("qc_failure"),
    severity: text("severity").notNull().default("medium"),
    status: text("status").notNull().default("reported"),
    reason: text("reason").notNull(),
    defectDescription: text("defect_description"),
    resolution: text("resolution"),
    assignedTo: uuid("assigned_to"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("remakes_tenant_id_idx").on(t.tenantId),
    index("remakes_tenant_status_idx").on(t.tenantId, t.status),
    index("remakes_tenant_order_idx").on(t.tenantId, t.orderId),
    index("remakes_tenant_customer_idx").on(t.tenantId, t.customerId),
    uniqueIndex("remakes_tenant_number_idx").on(t.tenantId, t.remakeNumber),
  ],
);

export const internalNotes = pgTable(
  "internal_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    authorId: uuid("author_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("internal_notes_tenant_id_idx").on(t.tenantId),
    index("idx_internal_notes_entity").on(t.entityType, t.entityId),
  ],
);

export const configurations = pgTable(
  "configurations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteItemId: uuid("quote_item_id").references(() => quoteItems.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => productTemplates.id, { onDelete: "set null" }),
    selections: jsonb("selections").notNull().default({}),
    dimensions: jsonb("dimensions").notNull().default({}),
    computedBreakdown: jsonb("computed_breakdown").notNull().default({}),
    pricingRuleVersion: integer("pricing_rule_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("configurations_tenant_id_idx").on(t.tenantId),
    index("configurations_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const wastageRules = pgTable(
  "wastage_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialType: text("material_type").notNull(),
    minDimension: numeric("min_dimension").notNull().default("0"),
    maxDimension: numeric("max_dimension"),
    wastagePct: numeric("wastage_pct").notNull().default("8"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    materialId: uuid("material_id").references(() => materials.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("wastage_rules_tenant_id_idx").on(t.tenantId),
    index("wastage_rules_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
    index("idx_wastage_rules_lookup").on(t.materialType, t.minDimension),
  ],
);

export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    event: text("event").notNull(),
    channel: text("channel").notNull().default("whatsapp"),
    language: text("language").notNull().default("en"),
    subject: text("subject"),
    body: text("body").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    uniqueIndex("notification_templates_event_channel_language_tenant_key").on(
      t.event,
      t.channel,
      t.language,
      t.tenantId,
    ),
  ],
);

export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    reference: text("reference"),
    event: text("event").notNull(),
    channel: text("channel").notNull(),
    recipient: text("recipient"),
    status: text("status").notNull().default("pending"),
    payload: jsonb("payload").notNull().default({}),
    response: jsonb("response"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("notification_log_tenant_id_idx").on(t.tenantId),
    index("idx_notification_log_entity").on(t.entityType, t.entityId),
    index("idx_notification_log_created").on(t.createdAt),
  ],
);

export const notificationDlq = pgTable(
  "notification_dlq",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    reference: text("reference"),
    event: text("event").notNull(),
    channel: text("channel").notNull(),
    recipient: text("recipient"),
    payload: jsonb("payload").notNull().default({}),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    replayedAt: timestamp("replayed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notification_dlq_tenant_id_idx").on(t.tenantId),
    index("idx_notification_dlq_entity").on(t.entityType, t.entityId),
    index("idx_notification_dlq_created").on(t.createdAt),
  ],
);

export const tenantAuditLog = pgTable(
  "tenant_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_tenant_audit_tenant").on(t.tenantId, t.createdAt)],
);

// ── Global tables (no tenant_id) ───────────────────────────────────────────

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    label: text("label").notNull(),
    category: text("category").notNull().default("general"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    permissionSlug: text("permission_slug").notNull().references(() => permissions.slug, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("role_permissions_tenant_role_permission_unique").on(t.tenantId, t.role, t.permissionSlug),
    index("role_permissions_tenant_role_idx").on(t.tenantId, t.role),
  ],
);

export const tenantRoles = pgTable(
  "tenant_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tenant_roles_tenant_slug_unique").on(t.tenantId, t.slug),
    index("tenant_roles_tenant_idx").on(t.tenantId),
  ],
);

export const plcDailySequences = pgTable(
  "plc_daily_sequences",
  {
    seqDate: date("seq_date").notNull(),
    seqType: text("seq_type").notNull(),
    lastNumber: integer("last_number").notNull().default(0),
  },
  (t) => [{ pk: { columns: [t.seqDate, t.seqType] } }],
);

// ── Attachments ────────────────────────────────────────────────────────────

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    fileName: text("file_name").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    uploadedBy: uuid("uploaded_by"),
    caption: text("caption"),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attachments_tenant_id_idx").on(t.tenantId),
    index("attachments_entity_idx").on(t.entityType, t.entityId),
    index("attachments_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

// ── Hierarchical quotation builder (T2.0) ─────────────────────────────────
// Quotation → Product → Section → Unit → Component
// All carry tenant_id and cascade-delete from quotation downward.

export const quotationProducts = pgTable(
  "quotation_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quotationId: uuid("quotation_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
    productTypeCode: text("product_type_code").notNull(),
    label: text("label"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("quotation_products_tenant_id_idx").on(t.tenantId),
    index("quotation_products_quotation_id_idx").on(t.quotationId),
    index("quotation_products_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quotationProductId: uuid("quotation_product_id").notNull().references(() => quotationProducts.id, { onDelete: "cascade" }),
    label: text("label"),
    materialId: uuid("material_id").references(() => catalogMaterials.id, { onDelete: "set null" }),
    finishId: uuid("finish_id").references(() => catalogFinishes.id, { onDelete: "set null" }),
    veneerId: uuid("veneer_id").references(() => catalogVeneers.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("sections_tenant_id_idx").on(t.tenantId),
    index("sections_quotation_product_id_idx").on(t.quotationProductId),
    index("sections_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const dimensionUnitEnum = pgEnum("dimension_unit", [
  "mm",
  "m",
  "m2",
]);

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "cascade" }),
    unitTypeId: uuid("unit_type_id"),
    widthMm: integer("width_mm").notNull().default(600),
    heightMm: integer("height_mm").notNull().default(720),
    depthMm: integer("depth_mm").notNull().default(600),
    lengthMm: integer("length_mm").notNull().default(0),
    dimensionUnit: dimensionUnitEnum("dimension_unit").notNull().default("mm"),
    qty: integer("qty").notNull().default(1),
    overrideFactorKeys: jsonb("override_factor_keys").notNull().default({}),
    computedUnitCost: numeric("computed_unit_cost", { precision: 14, scale: 2 }).notNull().default("0"),
    computedUnitPrice: numeric("computed_unit_price", { precision: 14, scale: 2 }).notNull().default("0"),
    snapshotUnitCost: numeric("snapshot_unit_cost", { precision: 14, scale: 2 }).notNull().default("0"),
    snapshotUnitPrice: numeric("snapshot_unit_price", { precision: 14, scale: 2 }).notNull().default("0"),
    finishId: uuid("finish_id").references(() => catalogFinishes.id, { onDelete: "restrict" }),
    widthTier: widthTierEnum("width_tier"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("units_tenant_id_idx").on(t.tenantId),
    index("units_section_id_idx").on(t.sectionId),
    index("units_finish_id_idx").on(t.finishId),
    index("units_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

export const componentKindEnum = pgEnum("component_kind", [
  "material",
  "hardware",
  "accessory",
  "manufacturing",
  "edge_band",
  "veneer",
  "finish",
]);

export const components = pgTable(
  "components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "cascade" }),
    kind: componentKindEnum("kind").notNull(),
    catalogId: uuid("catalog_id"),
    qty: numeric("qty", { precision: 10, scale: 3 }).notNull().default("1"),
    unitOfMeasure: text("unit_of_measure").notNull().default("pcs"),
    areaFunctionKey: text("area_function_key"),
    multiplicationMode: text("multiplication_mode").notNull().default("one_time"),
    computedAmount: numeric("computed_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    snapshotAmount: numeric("snapshot_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("components_tenant_id_idx").on(t.tenantId),
    index("components_unit_id_idx").on(t.unitId),
    index("components_section_id_idx").on(t.sectionId),
    index("components_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

// ── Unit type templates (reusable BOM definitions) ────────────────────────

export const unitTypes = pgTable(
  "unit_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    labelI18nKey: text("label_i18n_key").notNull(),
    categoryCode: text("category_code"),
    nominalWidthMm: integer("nominal_width_mm"),
    nominalHeightMm: integer("nominal_height_mm"),
    nominalDepthMm: integer("nominal_depth_mm"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("unit_types_tenant_id_idx").on(t.tenantId),
    index("unit_types_tenant_id_category_code_idx").on(t.tenantId, t.categoryCode),
    unique("unit_types_tenant_code_unique").on(t.tenantId, t.code),
  ],
);

export const unitTypeBom = pgTable(
  "unit_type_bom",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
    unitTypeId: uuid("unit_type_id")
      .notNull()
      .references(() => unitTypes.id, { onDelete: "cascade" }),
    kind: componentKindEnum("kind").notNull(),
    catalogRef: uuid("catalog_ref"),
    areaFunctionKey: text("area_function_key"),
    defaultQty: numeric("default_qty").notNull().default("1"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("unit_type_bom_tenant_id_idx").on(t.tenantId),
    index("unit_type_bom_unit_type_id_idx").on(t.unitTypeId),
    check(
      "unit_type_bom_catalog_or_function_check",
      sql`(
        (${t.kind} = 'manufacturing' AND ${t.areaFunctionKey} IS NOT NULL)
        OR ${t.catalogRef} IS NOT NULL
        OR ${t.areaFunctionKey} IS NOT NULL
      )`,
    ),
  ],
);

// ── Quote snapshots (append-only audit trail) ─────────────────────────────

export const quoteSnapshots = pgTable(
  "quote_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    state: text("state").notNull(),
    treeJson: jsonb("tree_json").notNull(),
    breakdownJson: jsonb("breakdown_json").notNull(),
    ruleVersionId: text("rule_version_id"),
    factorsJson: jsonb("factors_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("quote_snapshots_tenant_id_idx").on(t.tenantId),
    index("quote_snapshots_quotation_id_idx").on(t.quotationId),
    index("quote_snapshots_quotation_id_state_idx").on(t.quotationId, t.state),
  ],
);

// ── Price history (append-only catalog price versioning) ─────────────────────

export const priceHistory = pgTable("price_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  entityType: text("entity_type").notNull(), // 'material' | 'hardware' | 'accessory' | 'manufacturing'
  entityId: uuid("entity_id").notNull(),
  price: numeric("price", { precision: 14, scale: 2 }).notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("price_history_tenant_id_idx").on(t.tenantId),
  index("price_history_entity_idx").on(t.tenantId, t.entityType, t.entityId),
  index("price_history_effective_idx").on(t.tenantId, t.entityType, t.entityId, t.effectiveFrom),
]);

// ── Pricing shadow runs (legacy vs v3 comparison) ──────────────────────────

export const pricingShadowRuns = pgTable(
  "pricing_shadow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    legacyTotal: numeric("legacy_total", { precision: 14, scale: 2 }),
    v3Total: numeric("v3_total", { precision: 14, scale: 2 }).notNull(),
    diff: numeric("diff", { precision: 14, scale: 2 }),
    withinTolerance: boolean("within_tolerance").notNull().default(true),
    legacyError: text("legacy_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pricing_shadow_runs_tenant_id_idx").on(t.tenantId),
    index("pricing_shadow_runs_quotation_id_idx").on(t.quotationId),
    index("pricing_shadow_runs_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

// ── Catalog tables (tenant-scoped priced entities) ─────────────────────────

export const catalogSuppliers = pgTable("catalog_suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("catalog_suppliers_tenant_id_idx").on(t.tenantId),
]);

export const catalogMaterials = pgTable("catalog_materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  labelI18nKey: text("label_i18n_key").notNull(),
  pricingUnit: pricingUnitEnum("pricing_unit").notNull(),
  pricePerUnit: numeric("price_per_unit", { precision: 14, scale: 2 }).notNull(),
  defaultWastagePct: numeric("default_wastage_pct", { precision: 5, scale: 2 }),
  supplierId: uuid("supplier_id").references(() => catalogSuppliers.id, { onDelete: "restrict" }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("catalog_materials_tenant_id_idx").on(t.tenantId),
  check("catalog_materials_price_per_unit_positive", sql`${t.pricePerUnit} >= 0`),
]);

export const catalogMaterialVariants = pgTable("catalog_material_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  materialId: uuid("material_id").notNull().references(() => catalogMaterials.id, { onDelete: "restrict" }),
  thicknessMm: numeric("thickness_mm", { precision: 6, scale: 1 }),
  finishCode: text("finish_code"),
  priceModifier: numeric("price_modifier", { precision: 14, scale: 2 }).notNull().default("0"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("catalog_material_variants_tenant_id_idx").on(t.tenantId),
  index("catalog_material_variants_material_id_idx").on(t.materialId),
]);

export const catalogFinishes = pgTable("catalog_finishes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  pricePerUnit: numeric("price_per_unit", { precision: 14, scale: 2 }).notNull().default("0"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("catalog_finishes_tenant_id_idx").on(t.tenantId),
]);

export const catalogVeneers = pgTable("catalog_veneers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  pricePerM2: numeric("price_per_m2", { precision: 14, scale: 2 }).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("catalog_veneers_tenant_id_idx").on(t.tenantId),
  check("catalog_veneers_price_per_m2_positive", sql`${t.pricePerM2} >= 0`),
]);

export const catalogEdgeBands = pgTable("catalog_edge_bands", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  pricePerUnit: numeric("price_per_unit", { precision: 14, scale: 2 }).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("catalog_edge_bands_tenant_id_idx").on(t.tenantId),
  check("catalog_edge_bands_price_per_unit_positive", sql`${t.pricePerUnit} >= 0`),
]);

export const catalogHardware = pgTable("catalog_hardware", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  pricePerPiece: numeric("price_per_piece", { precision: 14, scale: 2 }).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("catalog_hardware_tenant_id_idx").on(t.tenantId),
  check("catalog_hardware_price_per_piece_positive", sql`${t.pricePerPiece} >= 0`),
]);

export const catalogAccessories = pgTable("catalog_accessories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  pricePerPiece: numeric("price_per_piece", { precision: 14, scale: 2 }).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("catalog_accessories_tenant_id_idx").on(t.tenantId),
  check("catalog_accessories_price_per_piece_positive", sql`${t.pricePerPiece} >= 0`),
]);

export const catalogManufacturingOps = pgTable("catalog_manufacturing_operations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  rateUnit: manufacturingRateUnitEnum("rate_unit").notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("catalog_manufacturing_operations_tenant_id_idx").on(t.tenantId),
  check("catalog_manufacturing_operations_rate_positive", sql`${t.rate} >= 0`),
]);

// ── Pricing levers, wastage, discounts, fees/credits ───────────────────────

export const tenantPricingFactors = pgTable("tenant_pricing_factors", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  factorKey: pricingFactorKeyEnum("factor_key").notNull(),
  percent: numeric("percent", { precision: 6, scale: 2 }).notNull().default("0"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("tenant_pricing_factors_tenant_id_idx").on(t.tenantId),
  check("tenant_pricing_factors_percent_range", sql`${t.percent} >= 0 AND ${t.percent} <= 100`),
]);

export const tenantWastageRules = pgTable("tenant_wastage_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  scope: wastageScopeEnum("scope").notNull(),
  ref: text("ref"),
  pct: numeric("pct", { precision: 6, scale: 2 }).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("tenant_wastage_rules_tenant_id_idx").on(t.tenantId),
]);

export const tenantDiscounts = pgTable("tenant_discounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  type: discountTypeEnum("type").notNull(),
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  maxValue: numeric("max_value", { precision: 14, scale: 2 }),
  validFrom: date("valid_from").notNull().default(new Date().toISOString().slice(0, 10)),
  validTo: date("valid_to"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("tenant_discounts_tenant_id_idx").on(t.tenantId),
  check("tenant_discounts_value_positive", sql`${t.value} >= 0`),
]);

export const feesCredits = pgTable("fees_credits", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  labelI18nKey: text("label_i18n_key").notNull(),
  sign: feeSignEnum("sign").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  formulaKey: text("formula_key"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("fees_credits_tenant_id_idx").on(t.tenantId),
  check("fees_credits_amount_or_formula", sql`${t.amount} IS NOT NULL OR ${t.formulaKey} IS NOT NULL`),
]);

// ── Export types ───────────────────────────────────────────────────────────

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type Quote = typeof quotes.$inferSelect;
export type QuoteItem = typeof quoteItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type QuotationProduct = typeof quotationProducts.$inferSelect;
export type NewQuotationProduct = typeof quotationProducts.$inferInsert;
export type Section = typeof sections.$inferSelect;
export type NewSection = typeof sections.$inferInsert;
export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;
export type Component = typeof components.$inferSelect;
export type NewComponent = typeof components.$inferInsert;
export type UnitType = typeof unitTypes.$inferSelect;
export type NewUnitType = typeof unitTypes.$inferInsert;
export type UnitTypeBom = typeof unitTypeBom.$inferSelect;
export type NewUnitTypeBom = typeof unitTypeBom.$inferInsert;
export type QuoteSnapshot = typeof quoteSnapshots.$inferSelect;
export type NewQuoteSnapshot = typeof quoteSnapshots.$inferInsert;

export type PriceHistory = typeof priceHistory.$inferSelect;
export type NewPriceHistory = typeof priceHistory.$inferInsert;
export type CatalogSupplier = typeof catalogSuppliers.$inferSelect;
export type NewCatalogSupplier = typeof catalogSuppliers.$inferInsert;
export type CatalogMaterial = typeof catalogMaterials.$inferSelect;
export type NewCatalogMaterial = typeof catalogMaterials.$inferInsert;
export type CatalogMaterialVariant = typeof catalogMaterialVariants.$inferSelect;
export type NewCatalogMaterialVariant = typeof catalogMaterialVariants.$inferInsert;
export type CatalogFinish = typeof catalogFinishes.$inferSelect;
export type NewCatalogFinish = typeof catalogFinishes.$inferInsert;
export type CatalogVeneer = typeof catalogVeneers.$inferSelect;
export type NewCatalogVeneer = typeof catalogVeneers.$inferInsert;
export type CatalogHardware = typeof catalogHardware.$inferSelect;
export type NewCatalogHardware = typeof catalogHardware.$inferInsert;
export type CatalogAccessory = typeof catalogAccessories.$inferSelect;
export type NewCatalogAccessory = typeof catalogAccessories.$inferInsert;
export type CatalogManufacturingOp = typeof catalogManufacturingOps.$inferSelect;
export type NewCatalogManufacturingOp = typeof catalogManufacturingOps.$inferInsert;
export type TenantPricingFactor = typeof tenantPricingFactors.$inferSelect;
export type NewTenantPricingFactor = typeof tenantPricingFactors.$inferInsert;
export type TenantWastageRule = typeof tenantWastageRules.$inferSelect;
export type NewTenantWastageRule = typeof tenantWastageRules.$inferInsert;
export type TenantDiscount = typeof tenantDiscounts.$inferSelect;
export type NewTenantDiscount = typeof tenantDiscounts.$inferInsert;
export type FeesCredit = typeof feesCredits.$inferSelect;
export type NewFeesCredit = typeof feesCredits.$inferInsert;
export type PricingShadowRun = typeof pricingShadowRuns.$inferSelect;
export type NewPricingShadowRun = typeof pricingShadowRuns.$inferInsert;
export type Remake = typeof remakes.$inferSelect;
export type NewRemake = typeof remakes.$inferInsert;

// ── Tasks & Operations Management (Vertical Slice) ────────────────────────

export const taskStatusEnum = pgEnum("task_status", [
  "not_started",
  "in_progress",
  "waiting_review",
  "completed",
  "cancelled",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const tenantCounters = pgTable(
  "tenant_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    counterType: text("counter_type").notNull(),
    lastValue: integer("last_value").notNull().default(1000),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tenant_counters_unique_idx").on(t.tenantId, t.counterType),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    taskCode: text("task_code").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("not_started"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    category: text("category").notNull().default("general"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    quoteId: uuid("quote_id").references(() => quotes.id, {
      onDelete: "set null",
    }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    productionStage: text("production_stage"),
    workOrderId: uuid("work_order_id"),
    remakeId: uuid("remake_id"),
    deliveryId: uuid("delivery_id"),
    opportunityId: uuid("opportunity_id"),
    reviewNotes: text("review_notes"),
    reviewedBy: uuid("reviewed_by"),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tasks_tenant_id_idx").on(t.tenantId),
    index("tasks_tenant_status_idx").on(t.tenantId, t.status),
    index("tasks_tenant_order_idx").on(t.tenantId, t.orderId),
    index("tasks_tenant_quote_idx").on(t.tenantId, t.quoteId),
    index("tasks_tenant_customer_idx").on(t.tenantId, t.customerId),
    index("tasks_tenant_opportunity_idx").on(t.tenantId, t.opportunityId),
    index("tasks_tenant_due_date_idx").on(t.tenantId, t.dueDate),
    uniqueIndex("tasks_tenant_code_idx").on(t.tenantId, t.taskCode),
  ],
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("task_assignees_tenant_task_idx").on(t.tenantId, t.taskId),
    index("task_assignees_tenant_user_idx").on(t.tenantId, t.userId),
    uniqueIndex("task_assignees_unique_idx").on(t.taskId, t.userId),
  ],
);

export type TenantCounter = typeof tenantCounters.$inferSelect;
export type NewTenantCounter = typeof tenantCounters.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskAssignee = typeof taskAssignees.$inferSelect;
export type NewTaskAssignee = typeof taskAssignees.$inferInsert;

// ── Invoice Payments Ledger ────────────────────────────────────────────────

export const invoicePayments = pgTable(
  "invoice_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    paymentNumber: text("payment_number").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paymentMethod: text("payment_method").notNull().default("bank_transfer"),
    referenceNumber: text("reference_number"),
    notes: text("notes"),
    recordedBy: uuid("recorded_by").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("invoice_payments_tenant_id_idx").on(t.tenantId),
    index("invoice_payments_tenant_invoice_idx").on(t.tenantId, t.invoiceId),
    index("invoice_payments_paid_at_idx").on(t.tenantId, t.paidAt),
    uniqueIndex("invoice_payments_unique_number_idx").on(
      t.tenantId,
      t.paymentNumber,
    ),
  ],
);

export type InvoicePayment = typeof invoicePayments.$inferSelect;
export type NewInvoicePayment = typeof invoicePayments.$inferInsert;

// ── Inventory & Stock Allocation ──────────────────────────────────────────

export const stockItems = pgTable(
  "stock_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    catalogItemId: uuid("catalog_item_id").notNull(),
    itemType: text("item_type").notNull(), // 'material' | 'hardware'
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    unit: text("unit").notNull(), // 'sheet' | 'pcs' | 'm2' | 'set' | 'pair'
    physicalQuantity: numeric("physical_quantity", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    reservedQuantity: numeric("reserved_quantity", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    minReorderLevel: numeric("min_reorder_level", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("stock_items_tenant_id_idx").on(t.tenantId),
    index("stock_items_tenant_catalog_idx").on(t.tenantId, t.catalogItemId),
    index("stock_items_tenant_sku_idx").on(t.tenantId, t.sku),
    index("stock_items_tenant_type_idx").on(t.tenantId, t.itemType),
    uniqueIndex("stock_items_tenant_catalog_unique_idx").on(
      t.tenantId,
      t.catalogItemId,
      t.itemType,
    ),
  ],
);

export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    stockItemId: uuid("stock_item_id")
      .notNull()
      .references(() => stockItems.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    remakeId: uuid("remake_id").references(() => remakes.id, {
      onDelete: "set null",
    }),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unit: text("unit").notNull(),
    status: text("status").notNull().default("reserved"), // 'reserved' | 'consumed' | 'released' | 'cancelled'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [
    index("stock_reservations_tenant_id_idx").on(t.tenantId),
    index("stock_reservations_tenant_order_idx").on(t.tenantId, t.orderId),
    index("stock_reservations_tenant_item_idx").on(t.tenantId, t.stockItemId),
    index("stock_reservations_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    stockItemId: uuid("stock_item_id")
      .notNull()
      .references(() => stockItems.id, { onDelete: "cascade" }),
    quantityDelta: numeric("quantity_delta", { precision: 12, scale: 3 }).notNull(),
    previousQuantity: numeric("previous_quantity", { precision: 12, scale: 3 }).notNull(),
    newQuantity: numeric("new_quantity", { precision: 12, scale: 3 }).notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("stock_adjustments_tenant_id_idx").on(t.tenantId),
    index("stock_adjustments_tenant_item_idx").on(t.tenantId, t.stockItemId),
    index("stock_adjustments_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

export type StockItemDb = typeof stockItems.$inferSelect;
export type NewStockItemDb = typeof stockItems.$inferInsert;
export type StockReservationDb = typeof stockReservations.$inferSelect;
export type NewStockReservationDb = typeof stockReservations.$inferInsert;
export type StockAdjustmentDb = typeof stockAdjustments.$inferSelect;
export type NewStockAdjustmentDb = typeof stockAdjustments.$inferInsert;

// ── Production Work Orders ────────────────────────────────────────────────

export const productionWorkOrders = pgTable(
  "production_work_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    workOrderNumber: text("work_order_number").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    remakeId: uuid("remake_id").references(() => remakes.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("ready"), // 'draft' | 'ready' | 'in_progress' | 'qc_pending' | 'completed' | 'cancelled'
    priority: text("priority").notNull().default("medium"), // 'low' | 'medium' | 'high' | 'critical'
    notes: text("notes"),
    scheduledDate: date("scheduled_date"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("production_work_orders_tenant_id_idx").on(t.tenantId),
    index("production_work_orders_tenant_order_idx").on(t.tenantId, t.orderId),
    index("production_work_orders_tenant_status_idx").on(t.tenantId, t.status),
    uniqueIndex("production_work_orders_unique_number_idx").on(
      t.tenantId,
      t.workOrderNumber,
    ),
  ],
);

export type ProductionWorkOrderDb = typeof productionWorkOrders.$inferSelect;
export type NewProductionWorkOrderDb = typeof productionWorkOrders.$inferInsert;

// ── Delivery, Installation & Customer Handover ───────────────────────────

export const deliveryHandovers = pgTable(
  "delivery_handovers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    deliveryNumber: text("delivery_number").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("ready_for_dispatch"), // 'ready_for_dispatch' | 'dispatched' | 'out_for_delivery' | 'delivered' | 'installation_pending' | 'installed' | 'handover_pending' | 'completed' | 'delivery_failed' | 'cancelled'
    deliveryAddress: text("delivery_address").notNull(),
    recipientName: text("recipient_name"),
    recipientPhone: text("recipient_phone"),
    scheduledDate: date("scheduled_date"),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    installationRequired: boolean("installation_required").notNull().default(false),
    installedAt: timestamp("installed_at", { withTimezone: true }),
    installerName: text("installer_name"),
    installerNotes: text("installer_notes"),
    handedOverAt: timestamp("handed_over_at", { withTimezone: true }),
    signerName: text("signer_name"),
    customerNotes: text("customer_notes"),
    handoverNotes: text("handover_notes"),
    signatureDataUrl: text("signature_data_url"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("delivery_handovers_tenant_id_idx").on(t.tenantId),
    index("delivery_handovers_tenant_order_idx").on(t.tenantId, t.orderId),
    index("delivery_handovers_tenant_customer_idx").on(t.tenantId, t.customerId),
    index("delivery_handovers_tenant_status_idx").on(t.tenantId, t.status),
    uniqueIndex("delivery_handovers_unique_number_idx").on(
      t.tenantId,
      t.deliveryNumber,
    ),
  ],
);

export type DeliveryHandoverDb = typeof deliveryHandovers.$inferSelect;
export type NewDeliveryHandoverDb = typeof deliveryHandovers.$inferInsert;

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    leadNumber: text("lead_number").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    location: text("location"),
    source: text("source").notNull().default("other"),
    interestedProduct: text("interested_product"),
    estimatedBudget: numeric("estimated_budget", { precision: 14, scale: 2 }),
    notes: text("notes"),
    assignedSalesperson: uuid("assigned_salesperson").references(
      () => appUsers.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("new"),
    nextAction: text("next_action"),
    nextActionDate: timestamp("next_action_date", { withTimezone: true }),
    convertedCustomerId: uuid("converted_customer_id").references(
      () => customers.id,
      { onDelete: "set null" },
    ),
    convertedOpportunityId: uuid("converted_opportunity_id"),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("leads_tenant_id_idx").on(t.tenantId),
    index("leads_tenant_status_idx").on(t.tenantId, t.status),
    index("leads_tenant_salesperson_idx").on(
      t.tenantId,
      t.assignedSalesperson,
    ),
    index("leads_tenant_phone_idx").on(t.tenantId, t.phone),
    index("leads_tenant_email_idx").on(t.tenantId, t.email),
    uniqueIndex("leads_unique_number_idx").on(t.tenantId, t.leadNumber),
  ],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    opportunityNumber: text("opportunity_number").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    leadId: uuid("lead_id").references(() => leads.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    projectType: text("project_type").notNull().default("residential"),
    value: numeric("value", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    salesOwner: uuid("sales_owner").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    stage: text("stage").notNull().default("new_lead"),
    source: text("source"),
    expectedCloseDate: date("expected_close_date"),
    nextAction: text("next_action"),
    nextActionDate: timestamp("next_action_date", { withTimezone: true }),
    siteAddress: text("site_address"),
    notes: text("notes"),
    status: text("status").notNull().default("open"),
    lostReason: text("lost_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("opportunities_tenant_id_idx").on(t.tenantId),
    index("opportunities_tenant_stage_idx").on(t.tenantId, t.stage),
    index("opportunities_tenant_customer_idx").on(t.tenantId, t.customerId),
    index("opportunities_tenant_sales_owner_idx").on(
      t.tenantId,
      t.salesOwner,
    ),
    index("opportunities_tenant_status_idx").on(t.tenantId, t.status),
    uniqueIndex("opportunities_unique_number_idx").on(
      t.tenantId,
      t.opportunityNumber,
    ),
  ],
);

export type LeadDb = typeof leads.$inferSelect;
export type NewLeadDb = typeof leads.$inferInsert;
export type OpportunityDb = typeof opportunities.$inferSelect;
export type NewOpportunityDb = typeof opportunities.$inferInsert;

// ── After-Sales CRM: Service Cases & Warranty ──────────────────────────────

export const serviceCases = pgTable(
  "service_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    caseNumber: text("case_number").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    projectId: uuid("project_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    remakeId: uuid("remake_id").references(() => remakes.id, {
      onDelete: "set null",
    }),
    deliveryId: uuid("delivery_id").references(() => deliveryHandovers.id, {
      onDelete: "set null",
    }),
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull().default("complaint"), // warranty, complaint, service, maintenance, other
    priority: text("priority").notNull().default("medium"), // low, medium, high, critical
    status: text("status").notNull().default("new"), // new, under_review, assigned, in_progress, waiting_customer, resolved, closed
    title: text("title").notNull(),
    description: text("description"),
    assignedTo: uuid("assigned_to").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("service_cases_tenant_id_idx").on(t.tenantId),
    index("service_cases_tenant_status_idx").on(t.tenantId, t.status),
    index("service_cases_tenant_customer_idx").on(t.tenantId, t.customerId),
    index("service_cases_tenant_order_idx").on(t.tenantId, t.orderId),
    uniqueIndex("service_cases_unique_number_idx").on(
      t.tenantId,
      t.caseNumber,
    ),
  ],
);

export type ServiceCaseDb = typeof serviceCases.$inferSelect;
export type NewServiceCaseDb = typeof serviceCases.$inferInsert;







