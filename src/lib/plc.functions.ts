// Server functions for generating PLC reference numbers

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getNextPLCNumber } from "@/lib/numbering";

const Input = z.object({
  type: z.enum(["quote", "invoice", "order", "request"]),
});

export const generatePLCNumber = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    return await getNextPLCNumber(data.type);
  });