-- Migration: 20261119_work_order_cut_list_items.sql
-- Sprint 7A: Workshop-Grade Cut-List CSV Importer & Relational Remake Linkage

-- 1. Create table work_order_cut_list_items
CREATE TABLE IF NOT EXISTS public.work_order_cut_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  work_order_id uuid NOT NULL REFERENCES public.production_work_orders(id) ON DELETE CASCADE,
  row_index integer NOT NULL DEFAULT 0,
  part_name text NOT NULL,
  unit_name text NOT NULL DEFAULT 'Unit',
  product_name text NOT NULL DEFAULT 'Custom Product',
  section_name text NOT NULL DEFAULT 'General',
  material_sku text NOT NULL DEFAULT 'CUSTOM',
  material_name text NOT NULL,
  length_mm numeric(10, 2) NOT NULL CHECK (length_mm > 0),
  width_mm numeric(10, 2) NOT NULL CHECK (width_mm > 0),
  thickness_mm numeric(10, 2) NOT NULL DEFAULT 18 CHECK (thickness_mm > 0),
  quantity numeric(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_of_measure text NOT NULL DEFAULT 'pcs',
  edge_top text,
  edge_bottom text,
  edge_left text,
  edge_right text,
  grain_direction text NOT NULL DEFAULT 'along_length',
  notes text,
  source text NOT NULL DEFAULT 'csv_import',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes on work_order_cut_list_items
CREATE INDEX IF NOT EXISTS work_order_cut_list_tenant_wo_idx ON public.work_order_cut_list_items (tenant_id, work_order_id);
CREATE INDEX IF NOT EXISTS work_order_cut_list_tenant_id_idx ON public.work_order_cut_list_items (tenant_id);

-- 3. Tenant immutability trigger
CREATE OR REPLACE FUNCTION public.guard_tenant_id_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable on table %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_order_cut_list_items_tenant_immutable ON public.work_order_cut_list_items;
CREATE TRIGGER trg_work_order_cut_list_items_tenant_immutable
  BEFORE UPDATE ON public.work_order_cut_list_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_tenant_id_immutable();

-- 4. Row Level Security (RLS)
ALTER TABLE public.work_order_cut_list_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_tenant_member') THEN
    CREATE POLICY "work_order_cut_list_items_tenant_select" ON public.work_order_cut_list_items
      FOR SELECT USING (public.is_tenant_member(tenant_id));
    CREATE POLICY "work_order_cut_list_items_tenant_insert" ON public.work_order_cut_list_items
      FOR INSERT WITH CHECK (public.is_tenant_member(tenant_id));
    CREATE POLICY "work_order_cut_list_items_tenant_update" ON public.work_order_cut_list_items
      FOR UPDATE USING (public.is_tenant_member(tenant_id));
    CREATE POLICY "work_order_cut_list_items_tenant_delete" ON public.work_order_cut_list_items
      FOR DELETE USING (public.is_tenant_member(tenant_id));
  ELSE
    CREATE POLICY "work_order_cut_list_items_tenant_isolation" ON public.work_order_cut_list_items
      FOR ALL USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Relational Remake Linkage: Add cut_list_item_id to remakes
ALTER TABLE public.remakes
  ADD COLUMN IF NOT EXISTS cut_list_item_id uuid REFERENCES public.work_order_cut_list_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS remakes_tenant_cut_list_item_idx ON public.remakes (tenant_id, cut_list_item_id);

-- 6. Register work-orders.edit permission
INSERT INTO public.permissions (slug, label, category)
VALUES ('work-orders.edit', 'تعديل واستيراد كشف تقطيع أمر التشغيل', 'work-orders')
ON CONFLICT (slug) DO NOTHING;
