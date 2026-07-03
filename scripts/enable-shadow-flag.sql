-- Enable pricing_shadow feature flag on PeleCanon tenant.
-- This enables the shadow comparison that runs in createQuote and saveV2Quote
-- non-blocking (logs only, never fails the user).
-- Run: PGPASSWORD=<pw> psql -h db.<ref>.supabase.co -U postgres -d postgres -f scripts/enable-shadow-flag.sql
\set tenant_id '2bf7cd99-d567-42d3-b5fc-22cc40654293'

UPDATE public.tenants
SET feature_flags = jsonb_set(
  COALESCE(feature_flags, '{}'::jsonb),
  '{pricing_shadow}',
  'true'::jsonb,
  true  -- create nested key if not present
)
WHERE id = :'tenant_id';

SELECT id, name, feature_flags
FROM public.tenants
WHERE id = :'tenant_id';
