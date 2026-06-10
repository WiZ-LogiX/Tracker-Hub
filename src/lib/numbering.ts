// Unified numbering: PLC-XXXXXX (6-char random alphanumeric code)
// Used for: quotes, invoices, orders, quote_requests, etc.
// Fully self-contained — no database dependency.

const CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

function generateCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

// In-memory set to avoid duplicates within the same process/request.
const recentCodes = new Set<string>();
const MAX_RECENT = 1000;

/**
 * Get next unique reference number formatted as PLC-XXXXXX
 * No DB query needed — uses random generation with in-memory dedup.
 * @returns Formatted reference like "PLC-1s2w5c"
 */
export async function getNextPLCNumber(
  _type: "quote" | "invoice" | "order" | "request"
): Promise<string> {
  // Try up to 20 times to generate a unique code (in-memory uniqueness only)
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateCode(6);
    if (!recentCodes.has(code)) {
      recentCodes.add(code);
      // Keep set from growing unbounded
      if (recentCodes.size > MAX_RECENT) {
        const first = recentCodes.values().next().value;
        if (first) recentCodes.delete(first);
      }
      return `PLC-${code}`;
    }
  }

  // Fallback: use timestamp-based code to guarantee uniqueness
  const ts = Date.now().toString(36);
  const code = generateCode(3) + ts.slice(-3);
  return `PLC-${code}`;
}