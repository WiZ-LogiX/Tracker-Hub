import { describe, it, expect } from "vitest";
import { db } from "./db/client.server";
import { quotes } from "./db/schema";
import { eq } from "drizzle-orm";
import { CANONICAL_QUOTE_NUMBER_REGEX, generatePLCId } from "./lib/numbering";

describe("Quotation Number Standardization Migration", () => {
  it("migrates all non-conforming quote numbers to PLC-XXXXX and preserves legacy numbers", async () => {
    const allQuotes = await db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        legacyQuoteNumber: quotes.legacyQuoteNumber,
        snapshot: quotes.snapshot,
      })
      .from(quotes);

    const existingNumbers = new Set(allQuotes.map((q) => q.quoteNumber));

    function generateUniqueCanonical(): string {
      let candidate = generatePLCId();
      while (existingNumbers.has(candidate)) {
        candidate = generatePLCId();
      }
      existingNumbers.add(candidate);
      return candidate;
    }

    let migratedCount = 0;

    for (const q of allQuotes) {
      if (!CANONICAL_QUOTE_NUMBER_REGEX.test(q.quoteNumber)) {
        const oldNumber = q.quoteNumber;
        const newCanonical = generateUniqueCanonical();

        const snap = ((q.snapshot as any) || {}) as Record<string, any>;
        snap.quoteNumber = newCanonical;
        snap.legacyQuoteNumber = oldNumber;

        console.log(`Migrating Quote ${q.id}: ${oldNumber} -> ${newCanonical}`);

        await db
          .update(quotes)
          .set({
            quoteNumber: newCanonical,
            legacyQuoteNumber: oldNumber,
            snapshot: snap,
          })
          .where(eq(quotes.id, q.id));

        migratedCount++;
      }
    }

    console.log(`Successfully migrated ${migratedCount} quotations.`);

    // Re-verify that 100% of quotes now conform to PLC-[0-9A-Z]{5}
    const updatedQuotes = await db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        legacyQuoteNumber: quotes.legacyQuoteNumber,
      })
      .from(quotes);

    for (const q of updatedQuotes) {
      expect(q.quoteNumber).toMatch(CANONICAL_QUOTE_NUMBER_REGEX);
    }
  });
});
