// Generated types placeholder.
//
// We can't regenerate from the Supabase CLI without a network round trip,
// so this file ships as a permissive stub that mirrors the PostgREST shape
// used by `@supabase/postgrest-js`. The previous stub used
// `Tables: Record<string, X>` for everything, which lets PostgREST's
// conditional `Tables[T] extends {Row: infer R} ? R : never` collapse to
// `never` once you ask for any concrete table name. By listing each
// business table as `{ Row: any; Insert: any; Update: any }`, the chained
// `.select()` / `.insert()` / `.update()` calls resolve to permissive
// `any` instead, which is what the codebase already uses at runtime
// (`(data ?? []).map(r => r.foo)` patterns).
//
// Replace the contents of this file with the output of
//   `npx supabase gen types typescript --linked > src/integrations/supabase/types.ts`
// once convenient — the rest of the app already casts/infers loosely and
// will gain more precise column types once that's done.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Permissive row shapes: every column lands as `any`, which is what the
// existing server functions already assume at runtime.
type Row = { [key: string]: any };
type Ins = { [key: string]: any };
type Upd = { [key: string]: any };

interface Tables {
  tenants:                { Row: Row; Insert: Ins; Update: Upd };
  tenant_members:         { Row: Row; Insert: Ins; Update: Upd };
  app_users:              { Row: Row; Insert: Ins; Update: Upd };
  attachments:            { Row: Row; Insert: Ins; Update: Upd };
  customers:              { Row: Row; Insert: Ins; Update: Upd };
  quotes:                 { Row: Row; Insert: Ins; Update: Upd };
  quote_items:            { Row: Row; Insert: Ins; Update: Upd };
  quote_requests:         { Row: Row; Insert: Ins; Update: Upd };
  invoices:               { Row: Row; Insert: Ins; Update: Upd };
  orders:                 { Row: Row; Insert: Ins; Update: Upd };
  production_assignments: { Row: Row; Insert: Ins; Update: Upd };
  production_logs:        { Row: Row; Insert: Ins; Update: Upd };
  production_photos:      { Row: Row; Insert: Ins; Update: Upd };
  qc_inspections:         { Row: Row; Insert: Ins; Update: Upd };
  remakes:                { Row: Row; Insert: Ins; Update: Upd };
  internal_notes:         { Row: Row; Insert: Ins; Update: Upd };
  products:               { Row: Row; Insert: Ins; Update: Upd };
  product_templates:      { Row: Row; Insert: Ins; Update: Upd };
  materials:              { Row: Row; Insert: Ins; Update: Upd };
  material_variants:      { Row: Row; Insert: Ins; Update: Upd };
  suppliers:              { Row: Row; Insert: Ins; Update: Upd };
  finishes:               { Row: Row; Insert: Ins; Update: Upd };
  veneers:                { Row: Row; Insert: Ins; Update: Upd };
  accessories:            { Row: Row; Insert: Ins; Update: Upd };
  pricing_factors:        { Row: Row; Insert: Ins; Update: Upd };
  pricing_rules:          { Row: Row; Insert: Ins; Update: Upd };
  wastage_rules:          { Row: Row; Insert: Ins; Update: Upd };
  workers:                { Row: Row; Insert: Ins; Update: Upd };
  discounts:              { Row: Row; Insert: Ins; Update: Upd };
  categories:             { Row: Row; Insert: Ins; Update: Upd };
  configurations:         { Row: Row; Insert: Ins; Update: Upd };
  audit_log:              { Row: Row; Insert: Ins; Update: Upd };
  notification_templates: { Row: Row; Insert: Ins; Update: Upd };
  notification_log:       { Row: Row; Insert: Ins; Update: Upd };
}

export interface Database {
  public: {
    Tables: Tables;
    Views: { [k: string]: { Row: Row } };
    Functions: { [k: string]: { Args: { [k: string]: unknown }; Returns: unknown } };
    Enums: { [k: string]: string };
    CompositeTypes: { [k: string]: { [k: string]: unknown } };
  };
}

export default {} as Database;