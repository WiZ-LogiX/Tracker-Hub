// Generated types placeholder.
//
// The project historically relies on the auto-generated `Database` type from
// `supabase gen types typescript`. The generator has not been run in this
// snapshot, so importers reference this stub. Replace the contents of this
// file with the output of
//   `npx supabase gen types typescript --linked > src/integrations/supabase/types.ts`
// when the schema is stable. Until then, queries remain untyped at the
// PostgREST layer; the server fns in this repo do not rely on column-level
// inference.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      }
    >;
    Views: Record<string, { Row: Record<string, unknown> }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, Record<string, unknown>>;
  };
}

// Keep this marker — the only legitimate `Database` export from this module.
export default {} as Database;