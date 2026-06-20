# 16. Future Improvements

## 16.1 From `.lovable/STATUS.md`

1. **Wire tenant middleware** — a single `requireTenant` middleware applied to every server fn that mutates tenant-owned data.
2. **`app_users(tenant_id, username)` unique constraint** so usernames are unique per-tenant (today the global `username` column allows duplicates across tenants by uniqueness intent only).
3. **Tighten catalog RLS for admin reads** — once admin roles satisfy PostgREST chains, drop the service-role bypass in `catalog.functions.ts`.

5. **Test harness in `package.json`** — `bunx vitest run` script + CI hook.
6. **Tenant branding in UI** — replace hardcoded `"PeleCanon"` in sidebar / notifications footer with `useTenant()`-derived name + logo.

## 16.2 From the codebase narrative

- **PDF generation** for quotations and invoices (today relies on `window.print()`).
- **Realtime production updates** so the kanban updates without manual reload.
- **Notification retry queue** (decouple from n8n path; backoff + idempotency).
- **Audit-log writes** for administrative actions (currently spread thin).
- **Cost-analysis bar charts** by month/quarter (recharts already a dependency).
- **Stronger i18n fallback** — replace `parseMissingKeyHandler` with locale-load-time hydration.
- **Storage facade** — `lib/storage.ts` so attachments/photos can switch providers (e.g. S3 → R2) without touching call sites.
- **API-key OAuth for n8n** rather than shared `X-Lovable-Token`.
- **Type the schema** once `npx supabase gen types typescript --linked` runs, then add `<Database>` back to `createClient`.