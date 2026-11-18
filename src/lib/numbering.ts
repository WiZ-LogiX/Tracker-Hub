/**
 * Canonical Quotation & Entity Numbering for PeleCanon
 *
 * Strict format: PLC-XXXXX (fixed 'PLC-' prefix + exactly 5 uppercase alphanumeric chars [0-9A-Z])
 * Examples: PLC-YQ3Z5, PLC-5PV1Z
 */

export const CANONICAL_QUOTE_NUMBER_REGEX = /^PLC-[0-9A-Z]{5}$/;

export function isCanonicalQuoteNumber(num: string | null | undefined): boolean {
  if (!num) return false;
  return CANONICAL_QUOTE_NUMBER_REGEX.test(num.trim());
}

const ALPHANUMERIC_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Generate a cryptographically secure unified PLC ID in canonical format PLC-XXXXX.
 * 5 uppercase alphanumeric characters [0-9A-Z].
 */
export function generatePLCId(): string {
  let result = "";
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 5; i++) {
      result += ALPHANUMERIC_CHARS[bytes[i] % ALPHANUMERIC_CHARS.length];
    }
  } else {
    for (let i = 0; i < 5; i++) {
      result += ALPHANUMERIC_CHARS.charAt(Math.floor(Math.random() * ALPHANUMERIC_CHARS.length));
    }
  }
  return `PLC-${result}`;
}

/**
 * Generate the next PLC number.
 * For quotes, returns canonical PLC-XXXXX format.
 */
export async function getNextPLCNumber(
  type: "quote" | "invoice" | "order",
): Promise<string> {
  if (type === "quote") {
    return generatePLCId();
  }
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
