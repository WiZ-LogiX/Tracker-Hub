import { createServerFn } from '@tanstack/react-start';
import { generatePLCNumber } from '@/lib/plc.functions';

export const GET = createServerFn({ method: 'GET' }).handler(
  async () => {
    const result = await generatePLCNumber({ type: 'quote' });
    return result;
  }
);