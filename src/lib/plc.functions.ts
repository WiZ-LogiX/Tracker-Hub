"use server";

import { createServerFn } from "@tanstack/react-start";

/**
 *  POST /api/plc
 *  Body: { type: "invoice" | "quote" | "order" }
 *  Returns: { plc: "PLC-invoice-230607-0042" }
 */
export const POST = createServerFn({ method: "POST" }).handler(
  async ({ data }) => {
    const type = (data as any)?.type ?? "invoice";

    // Simple deterministic generator – replace with DB sequence if needed
    const now = new Date();
    const suffix = now.toISOString().slice(0, 10).replace(/-/g, "").slice(-6); // e.g. "230607"
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
    const plc = `PLC-${type}-${suffix}-${random}`;

    return { plc };
  }
);