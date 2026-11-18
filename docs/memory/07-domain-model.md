# 7. Domain Model

The schema is defined and maintained in `src/db/schema.ts` via Drizzle ORM and backed by Supabase PostgreSQL migrations.

## 7.1 Tenancy & RBAC Tables (Drizzle ORM)

- **`tenants`**: Tenant account records (`id`, `slug`, `name`, `logo_url`, `currency`, `tax_rate`, etc.).
- **`app_users`**: Tenant user profile (`id` matching `auth.users`, `username`, `display_name`, `avatar_key`, `status`).
- **`tenant_members`**: User tenant membership (`tenant_id`, `user_id`, `role`, `custom_role_id`).
- **`tenant_roles`**: Dynamic tenant-scoped custom roles (`id`, `tenant_id`, `name`, `description`).
- **`permissions`**: Canonical catalog of 121 granular permission keys.
- **`role_permissions`**: Explicit permission mappings per tenant role (`tenant_id`, `role_name`, `permission_key`).

## 7.2 The 34 Tenant-Scoped Business Tables

All 34 business tables are fully typed in `src/db/schema.ts` and enforce `tenant_id NOT NULL` with RLS policies:

| Group | Tables |
| :--- | :--- |
| **Tenancy & Auth** | `tenants`, `app_users`, `tenant_members`, `tenant_roles`, `role_permissions` |
| **CRM & Customers** | `customers`, `leads`, `opportunities`, `service_cases`, `customer_files` |
| **Commercial Quotation** | `quotes`, `quote_items`, `quote_snapshots`, `configurations` |
| **Manufacturing Hierarchy** | `quotation_products`, `sections`, `units`, `components` |
| **Projects & Orders** | `projects`, `orders`, `work_orders`, `remakes`, `delivery_handovers` |
| **Finance & Invoices** | `invoices`, `invoice_payments` |
| **Operations & Tasks** | `tasks`, `task_assignees`, `task_attachments` |
| **Catalog & Pricing** | `suppliers`, `catalog_materials`, `catalog_material_variants`, `catalog_finishes`, `catalog_hardware`, `catalog_accessories`, `tenant_pricing_factors` |
| **Storage & Notifications** | `attachments`, `notifications_log` |

## 7.3 Constraints, Immutability & Indexes

1. **Tenant Immutability**: All tables carry a `tenant_id` immutability trigger preventing row re-assignment across tenants.
2. **Canonical Identifiers**:
   - Quotes: `quotes.quote_number` (`PLC-XXXXX`) unique constraint with legacy backward compatibility.
   - Orders: `orders.order_number` (`PLC-XXXXX`) and cryptographic `orders.tracking_token` (UUID).
   - Projects: `projects.project_number` (`PRJ-XXXXX`).
   - Deliveries: `delivery_handovers.delivery_number` (`DEL-XXXXX`).
3. **Compound Indexes**: Indexed on `(tenant_id, created_at)` and primary entity relational foreign keys.
