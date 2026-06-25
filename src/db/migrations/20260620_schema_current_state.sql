-- Migration: 20260620_schema_current_state.sql
-- Documents the current database schema state as of 2026-06-20.
-- This is a documentation-only migration (no-op). It records the schema
-- so new developers can see the full picture without reading 30+ prior
-- migration files.
--
-- Apply with: supabase db push or manual SQL execution.
-- This file is intentionally a no-op (IF NOT EXISTS on everything).

-- ── Enums ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('draft','sent','accepted','rejected','expired','converted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE request_status AS ENUM ('new','in_review','quoted','closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_stage AS ENUM (
    'deposit_received','design_approved','cutting','assembly',
    'finishing','quality_check','ready_for_pickup','delivered','completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE discount_type AS ENUM ('percentage','fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pricing_unit AS ENUM ('linear_meter','square_meter','unit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Tables ─────────────────────────────────────────────────────────────────
-- All CREATE TABLE statements use IF NOT EXISTS for idempotency.
-- Column types match the Supabase migrations exactly.

-- Tenants
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  primary_color text,
  tax_number text,
  commercial_registry text,
  address text,
  phone text,
  email text,
  currency text NOT NULL DEFAULT 'EGP',
  tax_rate numeric NOT NULL DEFAULT 14,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tenant members
CREATE TABLE IF NOT EXISTS tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- App users
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  username text NOT NULL,
  display_name text NOT NULL,
  avatar_key text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  governorate text,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  pricing_unit text NOT NULL DEFAULT 'linear_meter',
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Materials
CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  type text NOT NULL DEFAULT 'wood',
  price_per_unit numeric(12,2) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'm²',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  supplier_id uuid,
  country_of_origin text,
  wastage_pct numeric
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Finishes
CREATE TABLE IF NOT EXISTS finishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  price_modifier_pct numeric(6,2) NOT NULL DEFAULT 0,
  price_modifier_fixed numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Veneers
CREATE TABLE IF NOT EXISTS veneers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  price_per_m2 numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Accessories
CREATE TABLE IF NOT EXISTS accessories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  description_ar text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  base_price numeric(12,2) NOT NULL DEFAULT 0,
  labor_pct numeric(6,2) NOT NULL DEFAULT 15,
  wastage_pct numeric(6,2) NOT NULL DEFAULT 8,
  overhead_pct numeric(6,2) NOT NULL DEFAULT 10,
  margin_pct numeric(6,2) NOT NULL DEFAULT 25,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Product templates
CREATE TABLE IF NOT EXISTS product_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid,
  code text,
  name_ar text NOT NULL,
  name_en text,
  description_ar text,
  base_price numeric NOT NULL DEFAULT 0,
  default_config jsonb NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Pricing factors
CREATE TABLE IF NOT EXISTS pricing_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  label_ar text NOT NULL,
  kind text NOT NULL,
  value_pct numeric NOT NULL DEFAULT 0,
  value_fixed numeric NOT NULL DEFAULT 0,
  scope text NOT NULL DEFAULT 'global',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Pricing rules (immutable per version)
CREATE TABLE IF NOT EXISTS pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  formula jsonb NOT NULL DEFAULT '{}',
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Quote requests
CREATE TABLE IF NOT EXISTS quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  governorate text,
  product_category text NOT NULL,
  specs jsonb NOT NULL DEFAULT '{}',
  notes text,
  budget_range text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Quotes
CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text NOT NULL UNIQUE,
  request_id uuid REFERENCES quote_requests(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_code text,
  vat_pct numeric(5,2) NOT NULL DEFAULT 14,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  deposit_pct numeric(5,2) NOT NULL DEFAULT 50,
  valid_until date NOT NULL,
  notes text,
  snapshot jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Quote items
CREATE TABLE IF NOT EXISTS quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  material_id uuid REFERENCES materials(id) ON DELETE SET NULL,
  material_name text,
  finish_id uuid REFERENCES finishes(id) ON DELETE SET NULL,
  finish_name text,
  dimension_value numeric(10,3) NOT NULL DEFAULT 1,
  qty int NOT NULL DEFAULT 1,
  accessories jsonb NOT NULL DEFAULT '[]',
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  total numeric(14,2) NOT NULL,
  deposit_amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  snapshot jsonb NOT NULL DEFAULT '{}',
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  current_stage order_stage NOT NULL DEFAULT 'deposit_received',
  total numeric(14,2) NOT NULL DEFAULT 0,
  deposit numeric(14,2) NOT NULL DEFAULT 0,
  contract_date date NOT NULL,
  expected_delivery date,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Discounts
CREATE TABLE IF NOT EXISTS discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'percentage',
  value numeric(10,2) NOT NULL,
  max_value numeric(12,2),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  usage_count int NOT NULL DEFAULT 0,
  max_uses int,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Workers
CREATE TABLE IF NOT EXISTS workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Production logs
CREATE TABLE IF NOT EXISTS production_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stage_from order_stage,
  stage_to order_stage NOT NULL,
  transitioned_at timestamptz NOT NULL DEFAULT now(),
  transitioned_by uuid,
  notes text,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Production assignments
CREATE TABLE IF NOT EXISTS production_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stage order_stage NOT NULL,
  worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  started_at timestamptz,
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- QC inspections
CREATE TABLE IF NOT EXISTS qc_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stage order_stage NOT NULL,
  passed boolean NOT NULL DEFAULT false,
  notes text,
  inspector_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Remakes
CREATE TABLE IF NOT EXISTS remakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Internal notes
CREATE TABLE IF NOT EXISTS internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  author_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Configurations (used by configurator.tsx)
CREATE TABLE IF NOT EXISTS configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_item_id uuid REFERENCES quote_items(id) ON DELETE CASCADE,
  template_id uuid REFERENCES product_templates(id) ON DELETE SET NULL,
  selections jsonb NOT NULL DEFAULT '{}',
  dimensions jsonb NOT NULL DEFAULT '{}',
  computed_breakdown jsonb NOT NULL DEFAULT '{}',
  pricing_rule_version int,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Wastage rules
CREATE TABLE IF NOT EXISTS wastage_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_type text NOT NULL,
  min_dimension numeric NOT NULL DEFAULT 0,
  max_dimension numeric,
  wastage_pct numeric NOT NULL DEFAULT 8,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  material_id uuid REFERENCES materials(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Notification templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  language text NOT NULL DEFAULT 'en',
  subject text,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Notification log (append-only)
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  reference text,
  event text NOT NULL,
  channel text NOT NULL,
  recipient text,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}',
  response jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Audit log (append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Tenant audit log
CREATE TABLE IF NOT EXISTS tenant_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Permissions
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Role permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role text NOT NULL,
  permission_slug text NOT NULL REFERENCES permissions(slug) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, role, permission_slug)
);

-- Tenant roles (custom roles)
CREATE TABLE IF NOT EXISTS tenant_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

-- PLC daily sequences
CREATE TABLE IF NOT EXISTS plc_daily_sequences (
  seq_date date NOT NULL,
  seq_type text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (seq_date, seq_type)
);

-- Attachments
CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_key text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  caption text,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
-- Tenant-scoped indexes on all business tables.

CREATE INDEX IF NOT EXISTS customers_tenant_id_idx ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS customers_tenant_id_created_at_idx ON customers(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS categories_tenant_id_idx ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS materials_tenant_id_idx ON materials(tenant_id);
CREATE INDEX IF NOT EXISTS suppliers_tenant_id_idx ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS finishes_tenant_id_idx ON finishes(tenant_id);
CREATE INDEX IF NOT EXISTS veneers_tenant_id_idx ON veneers(tenant_id);
CREATE INDEX IF NOT EXISTS accessories_tenant_id_idx ON accessories(tenant_id);
CREATE INDEX IF NOT EXISTS products_tenant_id_idx ON products(tenant_id);
CREATE INDEX IF NOT EXISTS product_templates_tenant_id_idx ON product_templates(tenant_id);
CREATE INDEX IF NOT EXISTS pricing_factors_tenant_id_idx ON pricing_factors(tenant_id);
CREATE INDEX IF NOT EXISTS pricing_rules_tenant_id_idx ON pricing_rules(tenant_id);
CREATE INDEX IF NOT EXISTS quote_requests_tenant_id_idx ON quote_requests(tenant_id);
CREATE INDEX IF NOT EXISTS quotes_tenant_id_idx ON quotes(tenant_id);
CREATE INDEX IF NOT EXISTS quote_items_tenant_id_idx ON quote_items(tenant_id);
CREATE INDEX IF NOT EXISTS invoices_tenant_id_idx ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS orders_tenant_id_idx ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS discounts_tenant_id_idx ON discounts(tenant_id);
CREATE INDEX IF NOT EXISTS workers_tenant_id_idx ON workers(tenant_id);
CREATE INDEX IF NOT EXISTS production_logs_tenant_id_idx ON production_logs(tenant_id);
CREATE INDEX IF NOT EXISTS production_assignments_tenant_id_idx ON production_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS qc_inspections_tenant_id_idx ON qc_inspections(tenant_id);
CREATE INDEX IF NOT EXISTS remakes_tenant_id_idx ON remakes(tenant_id);
CREATE INDEX IF NOT EXISTS internal_notes_tenant_id_idx ON internal_notes(tenant_id);
CREATE INDEX IF NOT EXISTS configurations_tenant_id_idx ON configurations(tenant_id);
CREATE INDEX IF NOT EXISTS wastage_rules_tenant_id_idx ON wastage_rules(tenant_id);
CREATE INDEX IF NOT EXISTS notification_templates_tenant_id_idx ON notification_templates(tenant_id);
CREATE INDEX IF NOT EXISTS notification_log_tenant_id_idx ON notification_log(tenant_id);
CREATE INDEX IF NOT EXISTS audit_log_tenant_id_idx ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS attachments_tenant_id_idx ON attachments(tenant_id);
CREATE INDEX IF NOT EXISTS attachments_entity_idx ON attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS role_permissions_tenant_role_idx ON role_permissions(tenant_id, role);
CREATE INDEX IF NOT EXISTS tenant_roles_tenant_idx ON tenant_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_tenant ON tenant_audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_photos_order ON production_photos(order_id);
CREATE INDEX IF NOT EXISTS idx_mv_material ON material_variants(material_id);
CREATE INDEX IF NOT EXISTS idx_mv_supplier ON material_variants(supplier_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_entity ON internal_notes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_entity ON notification_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wastage_rules_lookup ON wastage_rules(material_type, min_dimension);

-- ── Done ───────────────────────────────────────────────────────────────────
-- This migration is a documentation no-op. It records the current schema
-- state for reference. No tables are created or modified (all use IF NOT EXISTS).
