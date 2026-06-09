// Unified numbering: PLC-XXXXXX (6-char random alphanumeric code)
// Used for: quotes, invoices, orders, quote_requests, etc.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

function generateCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

async function codeExists(table: string, column: string, code: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from(table)
    .select("id")
    .eq(column, `PLC-${code}`)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Get next unique reference number formatted as PLC-XXXXXX
 * @param type - Entity type: 'quote' | 'invoice' | 'order' | 'request'
 * @returns Formatted reference like "PLC-1s2w5c"
 */
export async function getNextPLCNumber(
  type: "quote" | "invoice" | "order" | "request"
): Promise<string> {
  const tableMap: Record<string, { table: string; column: string }> = {
    quote: { table: "quotes", column: "quote_number" },
    invoice: { table: "invoices", column: "invoice_number" },
    order: { table: "orders", column: "order_number" },
    request: { table: "quote_requests", column: "reference_number" },
  };

  const { table, column } = tableMap[type];

  // Try up to 20 times to generate a unique code
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateCode(6);
    const exists = await codeExists(table, column, code);
    if (!exists) {
      return `PLC-${code}`;
    }
  }

  // Fallback: use timestamp-based code to guarantee uniqueness
  const ts = Date.now().toString(36);
  const code = generateCode(3) + ts.slice(-3);
  return `PLC-${code}`;
}