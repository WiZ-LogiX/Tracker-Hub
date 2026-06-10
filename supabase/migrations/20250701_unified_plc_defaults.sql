-- ===================================================================
-- 20250701_unified_plc_defaults.sql
-- Unified PLC‑style reference numbers (PLC-XXXXXX)
-- ===================================================================

-- 1. Helper function that returns a short PLC reference
CREATE OR REPLACE FUNCTION public.gen_plc_reference(entity text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_prefix CONSTANT text := 'PLC-';
  v_random text;
BEGIN
  -- 6‑character alphanumeric random suffix
  SELECT substring(md5(random()::text) from 1 for 6) INTO v_random;
  RETURN v_prefix || v_random;
END;
$$;

-- 2. Update column defaults so newly inserted rows get a PLC number
--    (only affects rows where the column is NULL at insert time)
ALTER TABLE public.quotes          ALTER COLUMN quote_number      SET DEFAULT gen_plc_reference('quote');
ALTER TABLE public.invoices         ALTER COLUMN invoice_number    SET DEFAULT gen_plc_reference('invoice');
ALTER TABLE public.orders           ALTER COLUMN order_number        SET DEFAULT gen_plc_reference('order');
ALTER TABLE public.quote_requests   ALTER COLUMN reference_number  SET DEFAULT gen_plc_reference('request');

-- 3. Back‑fill existing rows that currently have NULL reference numbers
--    (or that still contain the old bulky format).  This runs once.
DO $$
DECLARE
  r record;
BEGIN
  -- Quotes
  FOR r IN SELECT id FROM public.quotes WHERE quote_number IS NULL OR quote_number LIKE 'PLC-%' LOOP
    UPDATE public.quotes SET quote_number = gen_plc_reference('quote') WHERE id = r.id;
  END LOOP;

  -- Invoices
  FOR r IN SELECT id FROM public.invoices WHERE invoice_number IS NULL OR invoice_number LIKE 'PLC-%' LOOP
    UPDATE public.invoices SET invoice_number = gen_plc_reference('invoice') WHERE id = r.id;
  END LOOP;

  -- Orders
  FOR r IN SELECT id FROM public.orders WHERE order_number IS NULL OR order_number LIKE 'PLC-%' LOOP
    UPDATE public.orders SET order_number = gen_plc_reference('order') WHERE id = r.id;
  END LOOP;

  -- Quote requests
  FOR r IN SELECT id FROM public.quote_requests WHERE reference_number IS NULL OR reference_number LIKE 'PLC-%' LOOP
    UPDATE public.quote_requests SET reference_number = gen_plc_reference('request') WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Optional: if you have rows that already have a PLC‑style number but in the old “PLC-YYMMDD‑XXXX” format,
--    you can replace them with the short 6‑char version:
--    UPDATE public.quotes      SET quote_number      = substr(quote_number, 1, 8) || substr(md5(quote_number||clock_timestamp())::text from 1 for 6);
--    (apply similar updates to invoices, orders, and quote_requests as needed.)

-- -------------------------------------------------------------------
-- End of migration
-- -------------------------------------------------------------------