// Unified numbering: PLC-XXXXX (5 digits, zero-padded)
// Uses a single sequence table to avoid conflicts across quotes/invoices/orders

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SEQUENCE_TABLE = "plc_sequences";

/**
 * Get next sequence number and format as PLC-XXXXX
 * @param type - 'quote' | 'invoice' | 'order' (for logging/tracking)
 * @returns Formatted number like "PLC-00001"
 */
export async function getNextPLCNumber(type: "quote" | "invoice" | "order"): Promise<string> {
  // Atomic increment using Postgres sequence
  const { data, error } = await supabaseAdmin.rpc("get_next_plc_number", { seq_type: type });
  
  if (error) {
    console.error("[getNextPLCNumber] RPC error:", error);
    throw new Error(`Failed to generate PLC number: ${error.message}`);
  }
  
  const num = Number(data);
  return `PLC-${String(num).padStart(5, "0")}`;
}

/**
 * Initialize the sequence table and RPC function (run once via migration)
 * This is the SQL you need to run in Supabase SQL Editor:
 */
export const INIT_SQL = `
-- Create sequence table
CREATE TABLE IF NOT EXISTS ${SEQUENCE_TABLE} (
  id SERIAL PRIMARY KEY,
  seq_type TEXT NOT NULL UNIQUE,
  current_value BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial rows for each type
INSERT INTO ${SEQUENCE_TABLE} (seq_type, current_value)
VALUES ('quote', 0), ('invoice', 0), ('order', 0)
ON CONFLICT (seq_type) DO NOTHING;

-- Create atomic increment function
CREATE OR REPLACE FUNCTION get_next_plc_number(seq_type TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  next_val BIGINT;
BEGIN
  UPDATE ${SEQUENCE_TABLE}
  SET current_value = current_value + 1,
      updated_at = NOW()
  WHERE seq_type = get_next_plc_number.seq_type
  RETURNING current_value INTO next_val;
  
  RETURN next_val;
END;
$$;
`;

/**
 * Get current sequence status (for admin/debug)
 */
export async function getSequenceStatus() {
  const { data, error } = await supabaseAdmin
    .from(SEQUENCE_TABLE)
    .select("*");
  
  if (error) throw error;
  return data;
}

/**
 * Reset sequence (admin only - use with caution)
 */
export async function resetSequence(type: "quote" | "invoice" | "order", value: number = 0) {
  const { error } = await supabaseAdmin
    .from(SEQUENCE_TABLE)
    .update({ current_value: value, updated_at: new Date().toISOString() })
    .eq("seq_type", type);
  
  if (error) throw error;
  return { success: true };
}