// PostgREST-compatible type stub.
//
// Without `npx supabase gen types typescript --linked`, the placeholder
// type below is structurally correct for PostgREST's inference: every
// table maps to a permissive table shape, which stops
// `.from(...)` chains from collapsing to `never`.
//
// Generate the real types:
//   1. npx supabase login
//   2. npx supabase link --project-ref <your-ref>
//   3. npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
//   4. Remove the `// @ts-nocheck` if present.
//   5. Add `<Database>` back to the createClient() calls in client.ts
//      and admin.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type UnknownRecord = Record<string, unknown>;

type GenericTable = {
  Row: UnknownRecord;
  Insert: UnknownRecord;
  Update: UnknownRecord;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: Record<string, GenericTable>;
    Views: Record<string, { Row: UnknownRecord; Relationships: [] }>;
    Functions: Record<string, { Args: UnknownRecord; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, UnknownRecord>;
  };
};
