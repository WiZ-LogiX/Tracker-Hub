import { db } from "../src/db/client.server";
import { quotes, orders, invoices, projects } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { CANONICAL_QUOTE_NUMBER_REGEX, generatePLCId } from "../src/lib/numbering";

async function run() {
  console.log("Auditing and migrating non-conforming quotation numbers...");

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

  console.log(`Successfully migrated ${migratedCount} quotations to canonical PLC-XXXXX format.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
