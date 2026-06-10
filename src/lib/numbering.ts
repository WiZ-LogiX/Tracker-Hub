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