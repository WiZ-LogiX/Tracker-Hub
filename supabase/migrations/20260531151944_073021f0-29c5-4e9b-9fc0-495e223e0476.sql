CREATE OR REPLACE FUNCTION public.gen_reference(entity text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
BEGIN
  SELECT COALESCE(settings->>'reference_prefix', 'PLC')
    INTO v_prefix
  FROM public.companies
  WHERE id = public.default_company_id();
  IF v_prefix IS NULL OR length(btrim(v_prefix)) = 0 THEN
    v_prefix := 'PLC';
  END IF;
  -- Unified reference: single brand prefix, no entity tag.
  RETURN v_prefix || '-' || to_char(now(), 'YYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6);
END;
$function$;