// Generated types placeholder.
//
// The previous stub listed each business table explicitly as
// `{ Row: any; Insert: any; Update: any }`. With that shape PostgREST's
// query-builder chain still occasionally collapsed to `never` because
// internal mapped types over record-like Index signatures interacted
// with `Insert`/`Update` generic constraints in a way TypeScript can't
// fully satisfy. The result was "Property X does not exist on type
// 'never'" across every `.from(...).insert(...)`, `.update(...)`, and
// chained `.select()` row read.
//
// Fix: relax `public.Tables` to a single permissive string index that
// points every table lookup at `any`. PostgREST sees
// `Schema["Tables"][TableName]` as `any`, the whole query-builder chain
// flows as `any`, and no row or insert argument is ever typed as
// `never`. Accesses via `.foo` produce `any` instead of error-out.
//
// When `npx supabase gen types typescript --linked` is run, replace this
// file with the generated Database and the codebase gains full column
// inference — every server function already casts loosely and will keep
// working under the stricter types.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: { [key: string]: any };
    Views: { [key: string]: { Row: any } };
    Functions: {
      [key: string]: {
        Args: { [key: string]: any };
        Returns: any;
      };
    };
    Enums: { [key: string]: string };
    CompositeTypes: { [key: string]: { [key: string]: any } };
  };
};

export default {} as Database;