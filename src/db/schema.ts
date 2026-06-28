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

export const modifierTypeEnum = pgEnum("modifier_type", [
  "percent",
  "fixed",
]);

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
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("open"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("remakes_tenant_id_idx").on(t.tenantId),
    index("remakes_tenant_id_created_at_idx").on(t.tenantId, t.createdAt),
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

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "cascade" }),
    unitTypeId: uuid("unit_type_id"),
    widthMm: integer("width_mm").notNull().default(600),
    heightMm: integer("height_mm").notNull().default(720),
    depthMm: integer("depth_mm").notNull().default(600),
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
]);

export const components = pgTable(
  "components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id").notNull().references(() => units.id, { onDelete: "cascade" }),
    kind: componentKindEnum("kind").notNull(),
    catalogId: uuid("catalog_id"),
    qty: numeric("qty", { precision: 10, scale: 3 }).notNull().default("1"),
    unitOfMeasure: text("unit_of_measure").notNull().default("pcs"),
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
  modifierType: modifierTypeEnum("modifier_type").notNull(),
  modifierValue: numeric("modifier_value", { precision: 14, scale: 2 }).notNull(),
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
