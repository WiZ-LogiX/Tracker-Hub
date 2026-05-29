
REVOKE ALL ON FUNCTION public.prevent_last_admin_removal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gen_reference(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gen_reference(text) TO authenticated, service_role;
