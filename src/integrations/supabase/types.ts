/**
 * Typed Supabase Database schema.
 *
 * Audit note: this file used to be `export type Database = any;`, which let
 * the codebase silently reference `user_roles`, `companies`, and other tables
 * that were deprecated or dropped during Phase 1. Without typing, those
 * references compile and only fail at runtime when the table is missing.
 *
 * This type keeps the *table-name* check alive (so `.from('user_roles')` is a
 * compile-time error) while staying permissive on row shapes — hand-rolling
 * strict row types cascades into "Argument of type ... is not assignable to
 * never" failures across the entire Postgrest QueryBuilder chain, which is
 * the exact false-negative style of errors that motivated the original `= any`.
 *
 * Regenerate from the live DB with:
 *   supabase gen types typescript --linked > src/integrations/supabase/types.ts
 * At that point, this file becomes redundant and can be deleted.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * The list of tables that exist *after* Phase 1. Tables not in this literal
 * are an immediate type error at every `.from('<name>')` call site.
 *
 * To add a table:
 *   1. Ship the migration under `supabase/migrations/`.
 *   2. Add the exact `pgTable("name")` value here as a string literal.
 *   3. (Optional) Run `supabase gen types` for column-precise typing.
 *
 * `user_roles` and `companies` are intentionally absent — both were dropped
 * during Phase 1 / 2. Any code that still imports them is a bug.
 */
type PublicTable =
  | "tenants"
  | "tenant_members"
  | "materials"
  | "material_variants"
  | "finishes"
  | "accessories"
  | "categories"
  | "products"
  | "product_templates"
  | "pricing_factors"
  | "pricing_rules"
  | "discounts"
  | "customers"
  | "quote_requests"
  | "quotes"
  | "quote_items"
  | "invoices"
  | "orders"
  | "configurations"
  | "production_assignments"
  | "production_logs"
  | "production_photos"
  | "qc_inspections"
  | "remakes"
  | "workers"
  | "wastage_rules"
  | "suppliers"
  | "veneers"
  | "notification_templates"
  | "notification_log"
  | "internal_notes"
  | "audit_log";

export type TenantRole = "owner" | "admin" | "sales" | "worker" | "viewer";

/**
 * Permissive row shape that still nests inside Supabase's nested type
 * machinery without cascading into `never`. Postgrest's QueryBuilder infers
 * `Row & { [relation: string]: unknown }` for `.select("*, relation(*)")`
 * chains, which collapses to `never` if we narrow too aggressively here.
 * The trade-off: columns are `any` (matching the previous contract), but
 * the *table name* path is type-checked.
 */
export interface Database {
  public: {
    Tables: {
      [_ in PublicTable]: {
        Row: { [key: string]: any };
        Insert: { [key: string]: any };
        Update: { [key: string]: any };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_tenant_member: {
        Args: { _table_tenant: string; _allowed_roles?: TenantRole[] | null };
        Returns: boolean;
      };
      worker_assignment_visible: {
        Args: { _worker_id: string };
        Returns: boolean;
      };
      handle_new_user: {
        Args: Record<string, never>;
        Returns: unknown;
      };
    };
    Enums: { tenant_role: TenantRole };
  };
}
