-- 20261118_milestone_billing_and_margin.sql
-- Milestone Billing Schedules and Project Financial Margin

-- 1. Add milestone billing and project columns to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS milestone_index integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS milestone_total_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS milestone_label text,
  ADD COLUMN IF NOT EXISTS milestone_pct numeric(5, 2),
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'issued',
  ADD COLUMN IF NOT EXISTS due_stage text;

-- 2. Add check constraint for billing_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_billing_status_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_billing_status_check
      CHECK (billing_status IN ('scheduled', 'issued', 'void'));
  END IF;
END $$;

-- 3. Create index on (tenant_id, project_id)
CREATE INDEX IF NOT EXISTS invoices_tenant_project_idx ON public.invoices (tenant_id, project_id);

-- 4. Backfill invoices.project_id from projects where projects.quote_id = invoices.quote_id
UPDATE public.invoices inv
SET project_id = p.id
FROM public.projects p
WHERE p.quote_id = inv.quote_id
  AND p.tenant_id = inv.tenant_id
  AND inv.project_id IS NULL;
