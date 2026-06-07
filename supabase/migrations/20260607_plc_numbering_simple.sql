-- ============================================
-- SIMPLE SERIAL: PLC-XXXXXX (e.g., PLC-000001)
-- ============================================
-- Drop existing
DROP FUNCTION IF EXISTS get_next_plc_number(TEXT);
DROP TABLE IF EXISTS plc_sequences;
DROP TABLE IF EXISTS plc_daily_sequences;

-- Simple sequence table (one row per type)
CREATE TABLE IF NOT EXISTS plc_sequences (
  seq_type TEXT NOT NULL PRIMARY KEY CHECK (seq_type IN ('quote','invoice','order')),
  current_value BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize
INSERT INTO plc_sequences (seq_type, current_value)
VALUES ('quote', 0), ('invoice', 0), ('order', 0)
ON CONFLICT (seq_type) DO NOTHING;

-- Atomic next-number function
CREATE OR REPLACE FUNCTION get_next_plc_number(p_seq_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next BIGINT;
BEGIN
  UPDATE plc_sequences
  SET current_value = current_value + 1,
      updated_at = NOW()
  WHERE seq_type = p_seq_type
  RETURNING current_value INTO v_next;
  
  -- Return formatted: PLC-000001 (6 digits)
  RETURN 'PLC-' || LPAD(v_next::TEXT, 6, '0');
END;
$$;

-- Status view
CREATE OR REPLACE VIEW plc_sequence_status AS
SELECT 
  seq_type,
  current_value,
  'PLC-' || LPAD(current_value::TEXT, 6, '0') AS last_generated,
  updated_at
FROM plc_sequences;