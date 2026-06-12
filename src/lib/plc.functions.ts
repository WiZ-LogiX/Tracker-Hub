import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GeneratePLCInput = z.object({
  type: z.enum(["quote", "invoice", "order"]),
});

/**
 * Generate a PLC number for a quote, invoice, or order.
 */
export const generatePLCNumber = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GeneratePLCInput.parse(input))
  .handler(async ({ data }) => {
    const type = data.type;
    const now = new Date();
    const suffix = now.toISOString().slice(0, 10).replace(/-/g, "").slice(-6);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
    const plc = `PLC-${type}-${suffix}-${random}`;
    return { plc };
  });