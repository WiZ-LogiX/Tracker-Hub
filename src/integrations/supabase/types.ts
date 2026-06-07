export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accessories: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name_ar: string
          name_en: string
          tenant_id: string
          unit_price: number
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
          tenant_id?: string
          unit_price?: number
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "accessories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          company_id: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          company_id?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          tenant_id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          company_id?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name_ar: string
          name_en: string
          pricing_unit: Database["public"]["Enums"]["pricing_unit"]
          tenant_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
          pricing_unit?: Database["public"]["Enums"]["pricing_unit"]
          tenant_id?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
          pricing_unit?: Database["public"]["Enums"]["pricing_unit"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          settings: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          settings?: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          settings?: Json
        }
        Relationships: []
      }
      configurations: {
        Row: {
          computed_breakdown: Json
          created_at: string
          dimensions: Json
          id: string
          pricing_rule_version: number | null
          quote_item_id: string | null
          selections: Json
          template_id: string | null
          tenant_id: string
        }
        Insert: {
          computed_breakdown?: Json
          created_at?: string
          dimensions?: Json
          id?: string
          pricing_rule_version?: number | null
          quote_item_id?: string | null
          selections?: Json
          template_id?: string | null
          tenant_id?: string
        }
        Update: {
          computed_breakdown?: Json
          created_at?: string
          dimensions?: Json
          id?: string
          pricing_rule_version?: number | null
          quote_item_id?: string | null
          selections?: Json
          template_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "configurations_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configurations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "product_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configurations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          email: string | null
          governorate: string | null
          id: string
          name: string
          phone: string | null
          tenant_id: string
        }
        Insert: {
          address?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          governorate?: string | null
          id?: string
          name: string
          phone?: string | null
          tenant_id?: string
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          governorate?: string | null
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          active: boolean
          code: string
          company_id: string
          created_at: string
          id: string
          max_uses: number | null
          max_value: number | null
          tenant_id: string
          type: Database["public"]["Enums"]["discount_type"]
          usage_count: number
          valid_from: string
          valid_to: string | null
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          company_id?: string
          created_at?: string
          id?: string
          max_uses?: number | null
          max_value?: number | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["discount_type"]
          usage_count?: number
          valid_from?: string
          valid_to?: string | null
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          max_uses?: number | null
          max_value?: number | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["discount_type"]
          usage_count?: number
          valid_from?: string
          valid_to?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "discounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finishes: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name_ar: string
          name_en: string
          price_modifier_fixed: number
          price_modifier_pct: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
          price_modifier_fixed?: number
          price_modifier_pct?: number
          tenant_id?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
          price_modifier_fixed?: number
          price_modifier_pct?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finishes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          tenant_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          tenant_id?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          company_id: string
          customer_id: string
          deposit_amount: number
          id: string
          invoice_number: string
          issued_at: string
          paid_amount: number
          paid_at: string | null
          quote_id: string
          snapshot: Json
          tenant_id: string
          total: number
        }
        Insert: {
          company_id?: string
          customer_id: string
          deposit_amount?: number
          id?: string
          invoice_number?: string
          issued_at?: string
          paid_amount?: number
          paid_at?: string | null
          quote_id: string
          snapshot?: Json
          tenant_id?: string
          total: number
        }
        Update: {
          company_id?: string
          customer_id?: string
          deposit_amount?: number
          id?: string
          invoice_number?: string
          issued_at?: string
          paid_amount?: number
          paid_at?: string | null
          quote_id?: string
          snapshot?: Json
          tenant_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      material_variants: {
        Row: {
          active: boolean
          company_id: string
          country_of_origin: string | null
          created_at: string
          currency: string
          id: string
          material_id: string
          price_per_unit: number
          supplier_id: string | null
          tenant_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          company_id?: string
          country_of_origin?: string | null
          created_at?: string
          currency?: string
          id?: string
          material_id: string
          price_per_unit?: number
          supplier_id?: string | null
          tenant_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          country_of_origin?: string | null
          created_at?: string
          currency?: string
          id?: string
          material_id?: string
          price_per_unit?: number
          supplier_id?: string | null
          tenant_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_variants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_variants_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_variants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          active: boolean
          company_id: string
          country_of_origin: string | null
          created_at: string
          id: string
          name_ar: string
          name_en: string
          price_per_unit: number
          supplier_id: string | null
          tenant_id: string
          type: string
          unit: string
          wastage_pct: number | null
        }
        Insert: {
          active?: boolean
          company_id?: string
          country_of_origin?: string | null
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
          price_per_unit?: number
          supplier_id?: string | null
          tenant_id?: string
          type?: string
          unit?: string
          wastage_pct?: number | null
        }
        Update: {
          active?: boolean
          company_id?: string
          country_of_origin?: string | null
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
          price_per_unit?: number
          supplier_id?: string | null
          tenant_id?: string
          type?: string
          unit?: string
          wastage_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          channel: string
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          error: string | null
          event: string
          id: string
          payload: Json
          recipient: string | null
          reference: string | null
          response: Json | null
          status: string
          tenant_id: string
        }
        Insert: {
          channel: string
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          error?: string | null
          event: string
          id?: string
          payload?: Json
          recipient?: string | null
          reference?: string | null
          response?: Json | null
          status?: string
          tenant_id?: string
        }
        Update: {
          channel?: string
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          error?: string | null
          event?: string
          id?: string
          payload?: Json
          recipient?: string | null
          reference?: string | null
          response?: Json | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          active: boolean
          body: string
          channel: string
          company_id: string
          created_at: string
          event: string
          id: string
          language: string
          subject: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          body: string
          channel?: string
          company_id?: string
          created_at?: string
          event: string
          id?: string
          language?: string
          subject?: string | null
          tenant_id?: string
        }
        Update: {
          active?: boolean
          body?: string
          channel?: string
          company_id?: string
          created_at?: string
          event?: string
          id?: string
          language?: string
          subject?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          company_id: string
          contract_date: string
          created_at: string
          current_stage: Database["public"]["Enums"]["order_stage"]
          customer_id: string
          delivered_at: string | null
          deposit: number
          expected_delivery: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          order_number: string
          quote_id: string | null
          tenant_id: string
          total: number
        }
        Insert: {
          company_id?: string
          contract_date?: string
          created_at?: string
          current_stage?: Database["public"]["Enums"]["order_stage"]
          customer_id: string
          delivered_at?: string | null
          deposit?: number
          expected_delivery?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          order_number?: string
          quote_id?: string | null
          tenant_id?: string
          total?: number
        }
        Update: {
          company_id?: string
          contract_date?: string
          created_at?: string
          current_stage?: Database["public"]["Enums"]["order_stage"]
          customer_id?: string
          delivered_at?: string | null
          deposit?: number
          expected_delivery?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          order_number?: string
          quote_id?: string | null
          tenant_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_factors: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          key: string
          kind: string
          label_ar: string
          scope: string
          tenant_id: string
          value_fixed: number
          value_pct: number
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          key: string
          kind: string
          label_ar: string
          scope?: string
          tenant_id?: string
          value_fixed?: number
          value_pct?: number
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          key?: string
          kind?: string
          label_ar?: string
          scope?: string
          tenant_id?: string
          value_fixed?: number
          value_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_factors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_factors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          company_id: string
          created_at: string
          effective_from: string | null
          effective_to: string | null
          formula: Json
          id: string
          name: string
          status: string
          tenant_id: string
          version: number
        }
        Insert: {
          company_id?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          formula?: Json
          id?: string
          name: string
          status?: string
          tenant_id?: string
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          formula?: Json
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_templates: {
        Row: {
          active: boolean
          base_price: number
          category_id: string | null
          code: string | null
          company_id: string
          created_at: string
          default_config: Json
          description_ar: string | null
          id: string
          name_ar: string
          name_en: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          base_price?: number
          category_id?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          default_config?: Json
          description_ar?: string | null
          id?: string
          name_ar: string
          name_en?: string | null
          tenant_id?: string
        }
        Update: {
          active?: boolean
          base_price?: number
          category_id?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          default_config?: Json
          description_ar?: string | null
          id?: string
          name_ar?: string
          name_en?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_assignments: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          notes: string | null
          order_id: string
          stage: Database["public"]["Enums"]["order_stage"]
          started_at: string | null
          status: string
          tenant_id: string
          worker_id: string | null
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          stage: Database["public"]["Enums"]["order_stage"]
          started_at?: string | null
          status?: string
          tenant_id?: string
          worker_id?: string | null
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          stage?: Database["public"]["Enums"]["order_stage"]
          started_at?: string | null
          status?: string
          tenant_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_logs: {
        Row: {
          company_id: string
          id: string
          notes: string | null
          order_id: string
          stage_from: Database["public"]["Enums"]["order_stage"] | null
          stage_to: Database["public"]["Enums"]["order_stage"]
          tenant_id: string
          transitioned_at: string
          transitioned_by: string | null
        }
        Insert: {
          company_id?: string
          id?: string
          notes?: string | null
          order_id: string
          stage_from?: Database["public"]["Enums"]["order_stage"] | null
          stage_to: Database["public"]["Enums"]["order_stage"]
          tenant_id?: string
          transitioned_at?: string
          transitioned_by?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          notes?: string | null
          order_id?: string
          stage_from?: Database["public"]["Enums"]["order_stage"] | null
          stage_to?: Database["public"]["Enums"]["order_stage"]
          tenant_id?: string
          transitioned_at?: string
          transitioned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_photos: {
        Row: {
          caption: string | null
          company_id: string
          created_at: string
          id: string
          order_id: string
          photo_url: string
          stage: Database["public"]["Enums"]["order_stage"] | null
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          company_id?: string
          created_at?: string
          id?: string
          order_id: string
          photo_url: string
          stage?: Database["public"]["Enums"]["order_stage"] | null
          tenant_id?: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          company_id?: string
          created_at?: string
          id?: string
          order_id?: string
          photo_url?: string
          stage?: Database["public"]["Enums"]["order_stage"] | null
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_photos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_photos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          base_price: number
          category_id: string | null
          code: string
          company_id: string
          created_at: string
          description_ar: string | null
          id: string
          labor_pct: number
          margin_pct: number
          name_ar: string
          name_en: string
          overhead_pct: number
          tenant_id: string
          wastage_pct: number
        }
        Insert: {
          active?: boolean
          base_price?: number
          category_id?: string | null
          code: string
          company_id?: string
          created_at?: string
          description_ar?: string | null
          id?: string
          labor_pct?: number
          margin_pct?: number
          name_ar: string
          name_en: string
          overhead_pct?: number
          tenant_id?: string
          wastage_pct?: number
        }
        Update: {
          active?: boolean
          base_price?: number
          category_id?: string | null
          code?: string
          company_id?: string
          created_at?: string
          description_ar?: string | null
          id?: string
          labor_pct?: number
          margin_pct?: number
          name_ar?: string
          name_en?: string
          overhead_pct?: number
          tenant_id?: string
          wastage_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      qc_inspections: {
        Row: {
          created_at: string
          id: string
          inspector_id: string | null
          notes: string | null
          order_id: string
          passed: boolean
          stage: Database["public"]["Enums"]["order_stage"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inspector_id?: string | null
          notes?: string | null
          order_id: string
          passed?: boolean
          stage?: Database["public"]["Enums"]["order_stage"]
          tenant_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          inspector_id?: string | null
          notes?: string | null
          order_id?: string
          passed?: boolean
          stage?: Database["public"]["Enums"]["order_stage"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_inspections_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          accessories: Json
          breakdown: Json
          company_id: string
          created_at: string
          dimension_value: number
          finish_id: string | null
          finish_name: string | null
          id: string
          line_total: number
          material_id: string | null
          material_name: string | null
          product_id: string | null
          product_name: string
          qty: number
          quote_id: string
          tenant_id: string
          unit_price: number
        }
        Insert: {
          accessories?: Json
          breakdown?: Json
          company_id?: string
          created_at?: string
          dimension_value?: number
          finish_id?: string | null
          finish_name?: string | null
          id?: string
          line_total?: number
          material_id?: string | null
          material_name?: string | null
          product_id?: string | null
          product_name: string
          qty?: number
          quote_id: string
          tenant_id?: string
          unit_price?: number
        }
        Update: {
          accessories?: Json
          breakdown?: Json
          company_id?: string
          created_at?: string
          dimension_value?: number
          finish_id?: string | null
          finish_name?: string | null
          id?: string
          line_total?: number
          material_id?: string | null
          material_name?: string | null
          product_id?: string | null
          product_name?: string
          qty?: number
          quote_id?: string
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_finish_id_fkey"
            columns: ["finish_id"]
            isOneToOne: false
            referencedRelation: "finishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_requests: {
        Row: {
          budget_range: string | null
          company_id: string
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          governorate: string | null
          id: string
          notes: string | null
          product_category: string
          reference_number: string
          specs: Json
          status: Database["public"]["Enums"]["request_status"]
          tenant_id: string
        }
        Insert: {
          budget_range?: string | null
          company_id?: string
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          governorate?: string | null
          id?: string
          notes?: string | null
          product_category: string
          reference_number?: string
          specs?: Json
          status?: Database["public"]["Enums"]["request_status"]
          tenant_id?: string
        }
        Update: {
          budget_range?: string | null
          company_id?: string
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          governorate?: string | null
          id?: string
          notes?: string | null
          product_category?: string
          reference_number?: string
          specs?: Json
          status?: Database["public"]["Enums"]["request_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          deposit_pct: number
          discount_amount: number
          discount_code: string | null
          id: string
          notes: string | null
          quote_number: string
          request_id: string | null
          snapshot: Json
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tenant_id: string
          total: number
          valid_until: string
          vat_amount: number
          vat_pct: number
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          deposit_pct?: number
          discount_amount?: number
          discount_code?: string | null
          id?: string
          notes?: string | null
          quote_number?: string
          request_id?: string | null
          snapshot?: Json
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tenant_id?: string
          total: number
          valid_until?: string
          vat_amount?: number
          vat_pct?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deposit_pct?: number
          discount_amount?: number
          discount_code?: string | null
          id?: string
          notes?: string | null
          quote_number?: string
          request_id?: string | null
          snapshot?: Json
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tenant_id?: string
          total?: number
          valid_until?: string
          vat_amount?: number
          vat_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      remakes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          order_id: string
          reason: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_id: string
          reason: string
          status?: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string
          reason?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remakes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remakes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          company_id: string
          country: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          country?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          tenant_id?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string | null
          id: string
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          commercial_registry: string | null
          created_at: string
          currency: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          plan: string
          primary_color: string | null
          slug: string
          status: string
          tax_number: string | null
          tax_rate: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          commercial_registry?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          plan?: string
          primary_color?: string | null
          slug: string
          status?: string
          tax_number?: string | null
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          commercial_registry?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          plan?: string
          primary_color?: string | null
          slug?: string
          status?: string
          tax_number?: string | null
          tax_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      veneers: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name_ar: string
          name_en: string
          price_per_m2: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
          price_per_m2?: number
          tenant_id?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
          price_per_m2?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "veneers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veneers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wastage_rules: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          material_id: string | null
          material_type: string
          max_dimension: number | null
          min_dimension: number
          tenant_id: string
          wastage_pct: number
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          material_id?: string | null
          material_type: string
          max_dimension?: number | null
          min_dimension?: number
          tenant_id?: string
          wastage_pct?: number
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          material_id?: string | null
          material_type?: string
          max_dimension?: number | null
          min_dimension?: number
          tenant_id?: string
          wastage_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "wastage_rules_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wastage_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name: string
          phone: string | null
          role: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          tenant_id?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: never; Returns: string }
      current_user_tenant_ids: { Args: never; Returns: string[] }
      default_company_id: { Args: never; Returns: string }
      gen_reference: { Args: { entity: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_member: {
        Args: {
          _roles: Database["public"]["Enums"]["tenant_role"][]
          _tenant_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "sales" | "production"
      discount_type: "percentage" | "fixed"
      order_stage:
        | "deposit_received"
        | "design_approved"
        | "cutting"
        | "assembly"
        | "finishing"
        | "quality_check"
        | "ready_for_pickup"
        | "delivered"
        | "completed"
      pricing_unit: "linear_meter" | "square_meter" | "unit"
      quote_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "expired"
        | "converted"
      request_status: "new" | "in_review" | "quoted" | "closed"
      tenant_role: "owner" | "admin" | "sales" | "worker" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "sales", "production"],
      discount_type: ["percentage", "fixed"],
      order_stage: [
        "deposit_received",
        "design_approved",
        "cutting",
        "assembly",
        "finishing",
        "quality_check",
        "ready_for_pickup",
        "delivered",
        "completed",
      ],
      pricing_unit: ["linear_meter", "square_meter", "unit"],
      quote_status: [
        "draft",
        "sent",
        "accepted",
        "rejected",
        "expired",
        "converted",
      ],
      request_status: ["new", "in_review", "quoted", "closed"],
      tenant_role: ["owner", "admin", "sales", "worker", "viewer"],
    },
  },
} as const