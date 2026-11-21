-- 20261118_milestone_billing_and_margin_down.sql
DROP INDEX IF EXISTS public.invoices_tenant_project_idx;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_billing_status_check,
  DROP COLUMN IF EXISTS due_stage,
  DROP COLUMN IF EXISTS billing_status,
  DROP COLUMN IF EXISTS milestone_pct,
  DROP COLUMN IF EXISTS milestone_label,
  DROP COLUMN IF EXISTS milestone_total_count,
  DROP COLUMN IF EXISTS milestone_index,
  DROP COLUMN IF EXISTS project_id;
