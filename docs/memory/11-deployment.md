# 11. Deployment

## 11.1 Target & Build Pipeline

- **Target**: Cloudflare Workers via `@cloudflare/vite-plugin` and Wrangler.
- **Production Build**: `npm run build` (`vite build`). Compiles Vite client chunks into `dist/client` and Cloudflare Workers SSR bundle into `dist/server`.
- **Preview Runtime**: `npm run preview` (`vite preview --port 8082`). Automated in `playwright.config.ts` for end-to-end verification.
- **Development**: `npm run dev` (`vite dev --port 8081`).

## 11.2 Entry Chain & SSR Error Handling

```text
Cloudflare Worker fetch
  → src/server.ts (Cloudflare entry)
     └─ dynamic-imports @tanstack/react-start/server-entry (cached)
  → SSR rendered
     └─ catastrophic 500s swapped for renderErrorPage() HTML
```

The `normalizeCatastrophicSsrResponse()` helper (`src/server.ts`) catches swallowed errors and substitutes a branded 500 HTML page. The original error is preserved out-of-band via `globalThis` listeners in `src/lib/error-capture.ts`.

## 11.3 Test & Verification Environment

- **Isolated Database**: Docker container `pelecanon_isolated_pg` on `localhost:5433/pelecanon_test`.
- **Production Safety**: Zero remote mutations. Production Supabase is completely untouched during local verification.
- **Playwright Global Setup**: `e2e/global-setup.ts` seeds baseline tenants, roles, users, and quotation fixtures deterministically.

## 11.4 Diagnostics & Health

`/admin/health` exposes administrative probes (`src/lib/diagnostics-db.functions.ts`):
- `getTableCounts`: Row counts across all 34 tenant-scoped tables.
- `getMemberships`: Verified tenant memberships.
- `getTenants`: Active tenant records.
