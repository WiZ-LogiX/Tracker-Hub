
CREATE OR REPLACE FUNCTION public.default_company_id() RETURNS uuid
LANGUAGE sql IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;

REVOKE EXECUTE ON FUNCTION public.default_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.default_company_id() TO authenticated, service_role;
