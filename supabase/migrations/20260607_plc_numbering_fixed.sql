-- ============================================
-- PLC-XXXXX UNIFIED NUMBERING SYSTEM (Fixed)
-- ============================================
-- Drop existing function first (parameter name conflict)
DROP FUNCTION IF EXISTS get_next_plc_number(TEXT);

-- Sequence table
CREATE TABLE IF NOT EXISTS plc_sequences (
  id SERIAL PRIMARY KEY,
  seq_type TEXT NOT NULL UNIQUE,  -- 'quote' | 'invoice' | 'order'
  current_value BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize sequences
INSERT INTO plc_sequences (seq_type, current_value)
VALUES ('quote', 0), ('invoice', 0), ('order', 0)
ON CONFLICT (seq_type) DO NOTHING;

-- Atomic next-number function (using p_seq_type to avoid conflict)
CREATE OR REPLACE FUNCTION get_next_plc_number(p_seq_type TEXT)
RETURNS BIGINT
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
  
  RETURN v_next;
END;
$$;

-- Status view
CREATE OR REPLACE VIEW plc_sequence_status AS
SELECT 
  seq_type,
  current_value,
  'PLC-' || LPAD(current_value::TEXT, 5, '0') AS next_formatted,
  updated_at
FROM plc_sequences;