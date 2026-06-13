-- Drop the legacy default_company_id() function now that no column
-- defaults reference it. Run AFTER the company_id column drops in
-- 20260612_tenancy_v1_drop_company_sentinel.sql have committed.

DROP FUNCTION IF EXISTS public.default_company_id();