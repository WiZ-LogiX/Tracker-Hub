-- ============================================
-- DAILY SEQUENCE: PLC-YYMMDD-XXXX (e.g., PLC-260607-0001)
-- ============================================
-- Drop existing
DROP FUNCTION IF EXISTS get_next_plc_number(TEXT);
DROP TABLE IF EXISTS plc_sequences;

-- Daily sequence table (one row per day per type)
CREATE TABLE IF NOT EXISTS plc_daily_sequences (
  seq_date DATE NOT NULL DEFAULT CURRENT_DATE,
  seq_type TEXT NOT NULL CHECK (seq_type IN ('quote','invoice','order')),
  current_value INT NOT NULL DEFAULT 0,
  PRIMARY KEY (seq_date, seq_type)
);

-- Atomic next-number function (resets daily)
CREATE OR REPLACE FUNCTION get_next_plc_number(p_seq_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INT;
  v_prefix TEXT;
BEGIN
  -- Prefix: PLC-YYMMDD
  v_prefix := 'PLC-' || TO_CHAR(CURRENT_DATE, 'YYMMDD');
  
  -- Atomic upsert + increment
  INSERT INTO plc_daily_sequences (seq_date, seq_type, current_value)
  VALUES (CURRENT_DATE, p_seq_type, 1)
  ON CONFLICT (seq_date, seq_type) DO UPDATE
    SET current_value = plc_daily_sequences.current_value + 1
  RETURNING current_value INTO v_next;
  
  -- Return formatted: PLC-260607-0001
  RETURN v_prefix || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- Status view
CREATE OR REPLACE VIEW plc_sequence_status AS
SELECT 
  seq_date,
  seq_type,
  current_value,
  'PLC-' || TO_CHAR(seq_date, 'YYMMDD') || '-' || LPAD(current_value::TEXT, 4, '0') AS last_generated
FROM plc_daily_sequences
ORDER BY seq_date DESC, seq_type;