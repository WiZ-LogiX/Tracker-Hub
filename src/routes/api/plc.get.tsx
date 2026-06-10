"// src/routes/api/plc.get.tsx
import { createServerFn } from '@tanstack/react-start';
import { generatePLCNumber } from '@/lib/plc.functions';

export const GET = createServerFn({ method: 'GET' }).handler(
  async () => {
    // You can change the type param ('quote', 'invoice', 'order', etc.) as needed
    const result = await generatePLCNumber({ type: 'quote' });
    // Return the raw string so the fetch works with JSON automatically
    return result as any;
  },
);