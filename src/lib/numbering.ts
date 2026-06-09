// Unified numbering: PLC-XXXXXX (6-char random alphanumeric code)
// Short enough for customer reference, unique via collision check

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

function generateCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

async function codeExists(type: "quote" | "invoice" | "order", code: string): Promise<boolean> {
  const table = type === "quote" ? "quotes" : type === "invoice" ? "invoices" : "orders";
  const column = type === "quote" ? "quote_number" : type === "invoice" ? "invoice_number" : "order_number";
  const { data } = await supabaseAdmin
    .from(table)
    .select("id")
    .eq(column, `PLC-${code}`)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Get next unique reference number formatted as PLC-XXXXXX
 * @param type - 'quote' | 'invoice' | 'order'
 * @returns Formatted reference like "PLC-1s2w5c"
 */
export async function getNextPLCNumber(type: "quote" | "invoice" | "order"): Promise<string> {
  // Try up to 20 times to generate a unique code
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateCode(6);
    const exists = await codeExists(type, code);
    if (!exists) {
      return `PLC-${code}`;
    }
  }
  // Fallback: use longer code with timestamp to guarantee uniqueness
  const ts = Date.now().toString(36);
  const code = generateCode(3) + ts.slice(-3);
  return `PLC-${code}`;
}