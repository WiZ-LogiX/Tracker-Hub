"import { createServerFn } from '@tanstack/react-start';
import { getNextPLCNumber } from '@/lib/numbering';

/**
 * Server‑side RPC that returns the next PLC‑style reference.
 *   type: \"quote\" | \"invoice\" | \"order\" | \"request\"
 * Returns: \"PLC‑xxxxx\" (6‑char random alphanumeric code)
 */
export const generatePLCNumber = createServerFn({ method: 'POST' })
  .handler(async ({ data }) => {
    const { type } = data;
    return await getNextPLCNumber({ type });
  });

// Ensure the function is exported for imports used elsewhere
export { generatePLCNumber };