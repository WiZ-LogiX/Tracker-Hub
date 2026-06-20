# 15. Technical Debt

## 15.1 Tenant leakage in admin pages
Many `supabase.from(...)` calls in `/admin/*` pages bypass explicit `tenant_id` filters. **RLS is the only barrier.**
- Affected: `internal_notes.tsx`, `customers.tsx`, `notifications.tsx`, `orders.tsx`, etc.
- Mitigation: a `tenantDb()` helper + tenant middleware (Phase 2 task; see [16-future.md](./16-future.md)).

## 15.3 Drizzle schema half-mirrored
`src/db/schema.ts` types **only** `attachments`. The rest of the schema is untyped, though `tenants`/`tenant_members` in `tenancy-schema.ts` and RLS migrations cover the tenancy layer. Phase 4 needs an inventory → `drizzle-kit pull` → copy → reconcile.

## 15.4 `useAuth` timing quirks
- Initial fetch runs before bootstrap in some cases → first paint may show no memberships briefly.
- `bootstrapTokenRef` race prevention uses a numeric counter — solid but deserves a comment block.

## 15.5 `admin.ts` is dead weight
`src/integrations/supabase/admin.ts` re-exports a duplicate `supabaseAdmin`; client code uses only `client.server.ts`.

## 15.6 `r2.config.ts` ships no runtime
The file is type + policy text. Worth a doc comment pointing to `docs/R2.md`.

## 15.7 No retry / DLQ for n8n
Failures accumulate in `notification_log` and are never re-fired.

## 15.8 Mid-failure order/invoice chain
`createOrder`/`createInvoiceFromQuote` lack transactional cleanup. A second-insert failure after the first leaves half a chain (e.g. invoice exists but no order).

## 15.9 i18n coverage holes
- `en.json` is comprehensive.
- `ar.json` covers admin nav + dashboard + customers + quotes only.
- `fr.json` is the smallest subset.
- The fallback handler ensures UI doesn't blank, but untranslated keys fall back to dot-separated fragments.

## 15.10 CSRF coverage
`src/start.ts:14` filters CSRF to `handlerType === 'serverFn'` only. Read endpoints aren't serverFn-wrapped; they go through the supabase client. Acceptable for the current SPA-only auth model — but a risk if any admin route starts hitting `supabase.from` directly for a write.

## 15.11 Test runner not wired in `package.json`
No `test` script. Running requires explicit `bunx vitest run tests/rls.test.ts` and a Postgres instance reachable from `DATABASE_URL_TEST`.

## 15.12 Hardcoded seed fixtures
`src/lib/seed.functions.ts` has 12 materials, 8 finishes, 26 accessories, 27 products inline. Should move to JSON for maintainability.

## 15.13 Type strictness assumed
`tsconfig.json` not visible in context; ESLint config also excluded; conventions inferred from style only. Many components use `any[]`, `any` coercions — strict mode would break.

## 15.14 `companies` and `configurations` artefacts
The `companies` table may still have references and `configurations` may have a `company_id` column missed during the cascade drop.

## 15.15 Phase 1 known blockers
1. `user_roles` referenced in `useAuth.tsx` but absent from Drizzle schema.
2. `companies` table artefact (still referenced in places).
3. `configurations.quote_item_id` / `template_id` etc. missed during Phase 1 — needs a follow-up migration.

## 15.16 R2 doc-only CORS
CORS policy lives in `docs/R2.md` + `src/lib/r2.config.ts`; the production bucket must be updated out-of-band. Owner action item.