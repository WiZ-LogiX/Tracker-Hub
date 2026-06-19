# 4. Directory Structure

```
src/
├── components/
│   ├── ui/                # shadcn primitives (gen'd; do NOT edit; custom is `sonner.tsx`)
│   ├── admin/             # Composite admin widgets
│   │   ├── GenericCrud.tsx     # Universal CRUD over Supabase OR service-fn-forced tables
│   │   ├── InternalNotes.tsx   # Per-entity sticky notes
│   │   └── AvatarUploader.tsx  # R2 webp upload, resize via OffscreenCanvas/canvas
│   ├── attachment-uploader.tsx # R2 + attachments register
│   ├── attachment-list.tsx     # List + sign/private + delete
│   ├── photo-uploader.tsx      # production-photos R2 uploader w/ OPTIONS preflight probe
│   ├── photo-grid.tsx          # Stage-grouped display using useSignedR2Urls
│   ├── theme-provider.tsx      # light/dark/system + localStorage 'pelecanon-theme'
│   ├── language-provider.tsx   # sync react-i18next lang change to <html dir/lang>
│   ├── language-switcher.tsx   # dropdown bound to SUPPORTED_LANGS
│   ├── theme-toggle.tsx        # Sun/Moon/Monitor dropdown
│   └── client-theme-init.tsx   # Hydration-safe theme+lang init without FOUC
│
├── db/
│   ├── client.server.ts    # Postgres client (postgres-js). STATUS.md flags it's still TCP, not neon-http.
│   ├── schema.ts           # Drizzle `attachments` only (skew — Neon "source of truth" intent)
│   └── tenancy-schema.ts   # Drizzle for `tenants`, `tenant_members`
│
├── db-health.functions.ts  # `checkNeonConnection` server fn
│
├── i18n/
│   ├── index.ts             # i18next init: fallbackLng='en' + dir setter
│   └── locales/{ar,en,fr}.json
│
├── integrations/
│   └── supabase/
│       ├── client.ts           # Browser anon-key supabase (no <Database> generic — see 14)
│       ├── client.server.ts    # Service-role supabase (RLS bypass)
│       ├── admin.ts            # Duplicate service-role client w/ import.meta.env keys (unused)
│       ├── auth-middleware.ts  # `requireSupabaseAuth` middleware — bearer verify
│       ├── auth-attacher.ts    # Client-side attacher that forwards the session JWT
│       ├── types.ts            # PostgREST-compatible stub Database type
│       └── icp-charts.tsx      # Referenced in STATUS.md; not in tree
│
├── lib/                       # See 04-detail below
├── server.ts                  # Cloudflare Workers entry w/ SSR error-branding
├── start.ts                   # TanStack Start config (request + function middleware)
├── router.tsx                 # QueryClient + Router setup
├── routeTree.gen.ts           # TanStack Router generated tree (do not hand-edit)
├── styles.css                 # Tailwind v4 (CSS-first config) + Emerald Prestige palette
│
└── routes/                    # File-based routes — see 04-routes below
```

## 4.1 `src/lib/` — server functions + utilities

| File | Purpose |
|---|---|
| `auth.functions.ts` | login/logout/getCurrentUser/createAppUser/setUserStatus/resetPassword/updateUserAvatar/ensureBootstrapAdmin/listAppUsers |
| `auth-helpers.ts` | `requireSession`, `getUser` for non-middleware-gated paths |
| `bootstrap-tenant.functions.ts` | `bootstrapMyTenant` self-heals tenant + membership |
| `attachments.functions.ts` | R2-backed file register + signed GET |
| `catalog.functions.ts` | list/upsert/delete for product_templates, materials, suppliers, finishes, veneers, accessories, discounts, workers, wastage_rules, pricing_rules |
| `cleanup.functions.ts` | All-rows-but-`tenants`/`tenant_members`/`auth.users` safe purge |
| `diagnostics-db.functions.ts` | service-role probes: getTableCounts, getMemberships, getTenants, getAuthUsers |
| `error-capture.ts` | Forward globalThis error listeners → 5-sec TTL ring buffer |
| `error-page.ts` | Branded 500 HTML page |
| `materials.functions.ts` | Server-fn CRUD for materials + wastage_rules lookup w/ fallback |
| `notifications.functions.ts` | sendTestNotification, sendNotification (5 events) via n8n + notification_log |
| `order.functions.ts` | `createOrder` — links quote → invoice → order, computes deposit |
| `invoice.functions.ts` | `createInvoiceFromQuote` — copies totals + snapshot |
| `plc.functions.ts` | `generatePLCNumber` (server; different shape) |
| `pricing.ts` | Central pricing engine: `calculateLine`, `calculateQuoteTotals`, `formatEGP` |
| `pricing/engine.ts` | JSON-DSL formula interpreter: `runFormula`, `DEFAULT_FORMULA` |
| `pricing-factors.functions.ts` | CRUD for `pricing_factors` |
| `r2.server.ts` | S3Client R2 helpers (presigned PUT/GET/delete, keygen, publicUrl) |
| `r2.config.ts` | R2 CORS policy + config types (no runtime deps) |
| `r2.utils.ts` | Client-safe URL helpers (`extractR2Key`, `getR2PublicUrl`, `generateObjectKeyClient`) |
| `r2.functions.ts` | Server fns (tenant-scoped PUT/Delete/Download) |
| `r2-views.functions.ts` | `getR2ViewUrls` for read-only display |
| `useSignedR2Urls.ts` | TanStack Query wrapper, 25-min staleTime vs 30-min signed TTL |
| `seed.functions.ts` | `ensurePricingSetup` + `seedSampleData` (heavy hardcoded fixtures) |
| `stages.ts` | ORDER_STAGES (9 values), STAGE_LABEL_AR, `getStageLabelAr`, `stageIndex`, `nextStage` |
| `tenant-context.ts` | Roles + canWrite/canDelete/requireRole guards |
| `tracking.functions.ts` | getPublicOrder, getPublicOrdersByPhone, getPublicTrackingByRef |
| `useAuth.tsx` | React context provider with bootstrap call + tenant storage-key |
| `numbering.ts` | Client-side `generatePLCId` and `getNextPLCNumber` |
| `utils.ts` | `cn()` tailwind merge helper |

## 4.2 Routes

```
src/routes/
├── __root.tsx                  # ThemeProvider + LanguageProvider + AuthProvider + Toaster
├── index.tsx                   # Landing page (gradient hero, feature grid)
├── auth.tsx                    # Username+password login (calls ensureBootstrapAdmin + login)
├── track.tsx                   # Public tracking (phone-only or ref+phone)
├── admin.tsx                   # AdminLayout: sidebar + mobile sheet + auth gate
└── admin/
    ├── index.tsx               # Dashboard cards (customers/quotes/orders/revenue)
    ├── team.tsx                # User mgmt (create/disable/reset-password + avatar)
    ├── customers.tsx           # CRUD via raw supabase client
    ├── track.tsx               # Admin-only track replica (i18n-first)
    ├── health.tsx              # Service-role data fetch diagnostics
    ├── requests.tsx            # Empty placeholder
    ├── seed.tsx                # UI for lib/seed.functions.ts
    ├── notifications.tsx       # notifications_log viewer + test send
    ├── cost-analysis.tsx       # Aggregate breakdown of quote_items.lines
    ├── accessories.tsx         # GenericCrud
    ├── finishes.tsx            # GenericCrud
    ├── veneers.tsx             # GenericCrud
    ├── pricing-factors.tsx     # Inline CRUD
    ├── pricing-rules.tsx       # Versioned JSON-DSL editor with validation
    ├── wastage-rules.tsx       # Material-keyed wastage rules with min/max dim ranges
    ├── materials.tsx           # Inline CRUD
    ├── suppliers.tsx           # GenericCrud
    ├── products.tsx            # GenericCrud
    ├── discounts.tsx           # Inline CRUD
    ├── workers.tsx             # Inline CRUD + workload badge
    ├── remakes.tsx             # Inline status outlet filter
    ├── invoices.tsx            # Invoice list
    ├── invoices.$id.tsx        # Invoice detail (markPaid, createOrder, internal notes)
    ├── orders.tsx              # 9-stage kanban, worker assignment, QC, photos, attachments
    └── quotes/
        ├── index.tsx           # Quote list
        ├── $id.tsx             # Quote detail (status transitions + convertToInvoice+Order)
        ├── new.tsx             # Legacy builder
        └── configurator.tsx    # Free-form builder
```

## 4.3 Supabase / scripts / tests

```
supabase/
├── config.toml                # Lovable-managed Supabase CLI
├── migrations/                # 16+ SQL migrations (incl. 3 numbering variants + 4 tenancy v1 files)
├── functions/migrate-helper/  # Edge fn: gated helper for migrations
└── wastage_rules_migration.sql # Ad-hoc wastage schema fix

scripts/
├── sprint1-apply.ts           # Idempotent migration runner
└── postflight-tenant-migration.sql # DB verification of tenant scoping

tests/
└── rls.test.ts                # Cross-tenant RLS verification (vitest + pg)
```

## 4.4 `.lovable/` process docs

- `STATUS.md` — living phase ledger (single source of truth).
- `neon-migration-plan.md` — Neon cutover plan, with **decision locks**: admin-created username/password only; no Google OAuth; no self-signup; R2 bucket `pelecanon`.
- `plan.md` — original Phase 2 multi-tenant SaaS plan, paths planned under `/t/$slug/admin/`.