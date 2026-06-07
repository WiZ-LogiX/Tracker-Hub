-- Unified numbering: PLC-YYMMDD-XXXX (daily sequence)
-- Migration: 20260607_plc_numbering_fixed.sql

-- 1. Daily sequence table (one row per type per day)
CREATE TABLE IF NOT EXISTS public.plc_daily_sequences (
  seq_date date NOT NULL,
  seq_type text NOT NULL CHECK (seq_type IN ('quote','invoice','order')),
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (seq_date, seq_type)
);

-- 2. Enable RLS on the sequence table
ALTER TABLE public.plc_daily_sequences ENABLE ROW LEVEL SECURITY;

-- 3. Allow authenticated users to read sequences (for display/debug)
CREATE POLICY "allow_read_sequences"
  ON public.plc_daily_sequences
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. Allow service role to manage sequences (RPC runs as service role)
CREATE POLICY "service_role_all"
  ON public.plc_daily_sequences
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. RPC function: get_next_plc_number
-- Runs with SECURITY DEFINER (owner = postgres/service_role) so it can
-- increment the sequence even though regular users only have SELECT on the table.
CREATE OR REPLACE FUNCTION public.get_next_plc_number(p_seq_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq_date date := CURRENT_DATE;
  v_last_number integer;
  v_formatted text;
BEGIN
  -- Lock the row for this type+date to prevent race conditions
  SELECT last_number
  INTO v_last_number
  FROM public.plc_daily_sequences
  WHERE seq_date = v_seq_date AND seq_type = p_seq_type
  FOR UPDATE;

  IF NOT FOUND THEN
    -- First sequence for this type today
    INSERT INTO public.plc_daily_sequences (seq_date, seq_type, last_number)
    VALUES (v_seq_date, p_seq_type, 1)
    ON CONFLICT (seq_date, seq_type) DO NOTHING
    RETURNING last_number INTO v_last_number;

    IF v_last_number IS NULL THEN
      -- Another transaction inserted concurrently, re-read
      SELECT last_number INTO v_last_number
      FROM public.plc_daily_sequences
      WHERE seq_date = v_seq_date AND seq_type = p_seq_type;
    END IF;
  ELSE
    -- Increment existing sequence
    UPDATE public.plc_daily_sequences
    SET last_number = last_number + 1
    WHERE seq_date = v_seq_date AND seq_type = p_seq_type
    RETURNING last_number INTO v_last_number;
  END IF;

  v_formatted := 'PLC-' || to_char(v_seq_date, 'YYMMDD') || '-' || lpad(v_last_number::text, 4, '0');
  RETURN v_formatted;
END;
$$;

-- 6. Helper view for admin/debug — REMOVED SECURITY DEFINER
-- Now uses SECURITY INVOKER (default) so RLS of querying user applies
CREATE OR REPLACE VIEW public.plc_sequence_status AS
SELECT
  seq_date,
  seq_type,
  last_number,
  'PLC-' || to_char(seq_date, 'YYMMDD') || '-' || lpad(last_number::text, 4, '0') AS next_number
FROM public.plc_daily_sequences
ORDER BY seq_date DESC, seq_type;

-- 7. Grant SELECT on view to authenticated users
GRANT SELECT ON public.plc_sequence_status TO authenticated;