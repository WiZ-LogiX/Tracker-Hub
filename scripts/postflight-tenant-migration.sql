-- Run these as separate SELECT statements against the live database.
-- Each one is expected to return 0 rows after the migration commit.
-- Use them to verify the migration and as a regression check after
-- future schema changes.

-- 1. No public table still has a `company_id` column.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'company_id';

-- 2. The new tenant-scoped UNIQUE constraint exists and reflects the
--    expected columns.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'notification_templates_event_channel_language_tenant_key';

-- 3. No column default still references default_company_id().
SELECT table_name, column_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_default ILIKE '%default_company_id%';

-- 4. The default_company_id() function is gone from pg_proc.
SELECT p.proname, n.nspname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'default_company_id'
  AND n.nspname IN ('public', '');

-- 5. Audit count of all tenant_id-bearing tables in public for a quick
--    sanity baseline. After every tenant-scoping migration we expect
--    this list to keep growing downward.
SELECT table_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'tenant_id'
ORDER BY table_name;