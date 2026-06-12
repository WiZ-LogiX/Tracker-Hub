/**
 * Generate a unified PLC ID in format PLC-XXXXX (5 random uppercase alphanumeric chars).
 * This ID is created once and reused across the quote → invoice → order chain.
 */
export function generatePLCId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `PLC-${result}`;
}

/**
 * Generate the next sequential PLC number for a given entity type
 * (quote / invoice / order). Format: PLC-TYPE-YYYYMMDD-NNNN (random suffix
 * for collision safety). Exists as a standalone helper so the legacy
 * /admin/quotes/new flow can keep working without a server round-trip
 * for the placeholder number.
 */
export async function getNextPLCNumber(
  type: "quote" | "invoice" | "order",
): Promise<string> {
  const now = new Date();
  const suffix = now
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "")
    .slice(-6);
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `PLC-${type}-${suffix}-${random}`;
}