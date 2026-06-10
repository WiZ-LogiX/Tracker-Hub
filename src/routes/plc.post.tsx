import { createServerFn } from '@tanstack/react-start';
import { generatePLCNumber } from '@/lib/plc.functions';

export const POST = createServerFn({ method: 'POST' }).handler(
  async () => {
    // Expect a JSON body like { type: 'quote' | 'invoice' | 'order' }
    const { data } = await generatePLCNumber(data);
    return data;
  }
);