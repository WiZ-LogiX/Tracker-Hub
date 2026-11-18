-- 20261112_projects_entity.sql
-- Commercial & Operational Workflow: Dedicated Persistent Projects Entity
-- Links Customers, Originating Quotes, Production Orders, CRM Opportunities, Deliveries, and Invoices.

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  project_type TEXT NOT NULL DEFAULT 'residential',
  status TEXT NOT NULL DEFAULT 'active',
  current_stage TEXT NOT NULL DEFAULT 'production',
  total_value NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  sales_owner UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT
);

-- Performance and Multi-Tenancy Indexes
CREATE INDEX IF NOT EXISTS projects_tenant_id_idx ON public.projects(tenant_id);
CREATE INDEX IF NOT EXISTS projects_tenant_customer_idx ON public.projects(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS projects_tenant_quote_idx ON public.projects(tenant_id, quote_id);
CREATE INDEX IF NOT EXISTS projects_tenant_order_idx ON public.projects(tenant_id, order_id);
CREATE INDEX IF NOT EXISTS projects_tenant_status_idx ON public.projects(tenant_id, status);
CREATE INDEX IF NOT EXISTS projects_tenant_created_at_idx ON public.projects(tenant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS projects_unique_number_idx ON public.projects(tenant_id, project_number);

-- Row Level Security (RLS)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_projects_select" ON public.projects
  FOR SELECT USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_projects_insert" ON public.projects
  FOR INSERT WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_projects_update" ON public.projects
  FOR UPDATE USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_projects_delete" ON public.projects
  FOR DELETE USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);
