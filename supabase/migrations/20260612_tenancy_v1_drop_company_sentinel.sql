-- Phase 1 closing migration: strip the legacy company_id plumbing.
-- Idempotent — re-running is safe.
-- This file replaces the WORKING 1fi-A SQL the user ran live.
-- The corresponding 1fi-B (DROP FUNCTION default_company_id()) lives in
-- a separate migration because Postgres requires all references to a
-- function/column to be gone before a function can be dropped.

BEGIN;

-- 1. Drop the legacy 4-column UNIQUE constraint that names company_id.
ALTER TABLE public.notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_company_id_event_channel_language_key;

-- 2. Add the new 4-column UNIQUE keyed on tenant_id.
ALTER TABLE public.notification_templates
  ADD CONSTRAINT notification_templates_event_channel_language_tenant_key
  UNIQUE (event, channel, language, tenant_id);

-- 3. Drop company_id from every public table that still has it.
--    Each DROP is idempotent (IF EXISTS) so re-running is safe.
ALTER TABLE public.accessories            DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.audit_log              DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.categories             DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.customers              DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.discounts              DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.finishes               DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.invoices               DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.materials              DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.notification_log       DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.notification_templates DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.orders                 DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.production_logs        DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.production_photos      DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.products               DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.quote_items            DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.quote_requests         DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.quotes                 DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.wastage_rules          DROP COLUMN IF EXISTS company_id;

-- Defensive guard. We don't expect a public.companies table to exist after
-- 1e/1f; if it does for any reason, drop it now. Idempotent.
DROP TABLE IF EXISTS public.companies;

COMMIT;