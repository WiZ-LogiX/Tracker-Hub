-- =============================================================================
-- Sprint 2.0 — Drop the orphan `configurations.company_id` column.
--
-- The `configurations` table was missed by `20260612_tenancy_v1_drop_company_sentinel.sql`
-- because the post-Phase-1 sweep only enumerated the original business table
-- list. This file is symmetric with that migration (DROP COLUMN IF EXISTS +
-- guard against partial replay) and is safe to re-run.
--
-- Idempotency:
--   * DROP COLUMN IF EXISTS — no error if already gone.
--   * The DO block lets us no-op silently if the column never existed.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'configurations'
      AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.configurations DROP COLUMN company_id;
  END IF;
END $$;
