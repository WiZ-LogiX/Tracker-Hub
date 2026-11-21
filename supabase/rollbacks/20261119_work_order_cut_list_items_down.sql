-- Rollback: 20261119_work_order_cut_list_items_down.sql
-- Sprint 7A Rollback: Workshop-Grade Cut-List CSV Importer & Relational Remake Linkage

DROP INDEX IF EXISTS public.remakes_tenant_cut_list_item_idx;
ALTER TABLE public.remakes DROP COLUMN IF EXISTS cut_list_item_id;

DROP TRIGGER IF EXISTS trg_work_order_cut_list_items_tenant_immutable ON public.work_order_cut_list_items;
DROP TABLE IF EXISTS public.work_order_cut_list_items CASCADE;
