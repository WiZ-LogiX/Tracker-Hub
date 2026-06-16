import { pgTable, uuid, text, numeric, timestamp, pgEnum, pgSchema } from "drizzle-orm/pg-core";

// Sprint 1.1: new tenancy tables. These mirror the Supabase migration
// `20260612_tenancy_v1.sql`. The enum matches the one created there.

// Drizzle cannot statically point at foreign schemas (e.g. auth.users) for a
// literal FK column without a defined table reference. We model auth.users
// here purely for typing; the real FK is created in the SQL migration where
// Supabase owns the auth schema.
const authSchema = pgSchema("auth");
const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

export const tenantRoleEnum = pgEnum("tenant_role", [
  "owner",
  "admin",
  "sales",
  "worker",
  "viewer",
]);

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantMembers = pgTable("tenant_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  // FK to auth.users(id) is created in the SQL migration (Supabase owns auth).
  // Drizzle cannot statically point at auth schemas without a literal table,
  // so we use authUsers above as the typed reference.
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  role: tenantRoleEnum("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type TenantMember = typeof tenantMembers.$inferSelect;
export type NewTenantMember = typeof tenantMembers.$inferInsert;
