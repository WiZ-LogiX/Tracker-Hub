"import { supabaseAdmin } from '@/integrations/supabase/client.server';

/**
 * Get next sequence number formatted as PLC-YYMMDD-XXXX
 * @param type - 'quote' | 'invoice' | 'order'
 * @returns Formatted number like \"PLC-260607-0001\"
 */
export async function getNextPLCNumber({ type }: { type: 'quote' | 'invoice' | 'order' }): Promise<string> {
  const { data, error } = await (supabaseAdmin.rpc as any)(
    'get_next_plc_number',
    { p_seq_type: type }
  );
  
  if (error) {
    console.error('[getNextPLCNumber] RPC error:', error);
    throw new Error(`Failed to generate PLC number: ${error.message}`);
  }
  
  return data as string;
}

/**
 * Get current sequence status (for admin/debug)
 */
export async function getSequenceStatus() {
  const { data, error } = await (supabaseAdmin.rpc as any)(
    'plc_sequence_status',
    undefined
  );
  
  if (error) throw error;
  return data;
}

/**
 * Reset today's sequence (admin only - use with caution)
 */
export async function resetTodaySequence(type: 'quote' | 'invoice' | 'order') {
  const { error } = await supabaseAdmin
    .from('plc_daily_sequences')
    .delete()
    .eq('seq_date', new Date().toISOString().slice(0, 10))
    .eq('seq_type', type);
    if (error) throw error;
  return { success: true };
}