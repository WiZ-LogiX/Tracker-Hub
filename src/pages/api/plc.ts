import { createServerFn } from "@tanstack/react-start";
import { getNextPLCNumber } from "@/lib/numbering";

/**
 * POST /api/plc
 * Body: { type: "quote" | "invoice" | "order" | "request" }
 */
export async function POST(request: Request) {
  const { data } = await request.json();
  const plcNumber = await getNextPLCNumber({ type: data.type });
  return new Response(JSON.stringify({ plc: plcNumber }), {
    headers: { "Content-Type": "application/json" }
  });
}