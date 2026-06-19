# 11. Deployment

## 11.1 Target

- **Cloudflare Workers** via `@cloudflare/vite-plugin` + Wrangler.
- Build: `bun build` (Drizzle fixture uses `vite build`).
- Dev: `bun dev` → port 5173.

## 11.2 Entry chain

```
Cloudflare Worker fetch
  → src/server.ts (Cloudflare entry)
     └─ dynamic-imports @tanstack/react-start/server-entry (cached)
  → SSR rendered
     └─ catastrophic 500s swapped for renderErrorPage() HTML
```

The `normalizeCatastrophicSsrResponse()` helper (`src/server.ts:40+`) detects the h3 swallowed-error shape (`{"unhandled":true,"message":"HTTPError","status":500}`) and substitutes a branded 500 HTML page. The original `Error` is captured out-of-band via `globalThis` listeners (`src/lib/error-capture.ts`) with a 5-second TTL ring buffer.

## 11.3 CI/CD

- **None in-repo** — no `.github/`, no `.gitlab-ci.yml`. Lovable handles CI/CD on its own platform.
- Branch previews: each Lovable branch deploys to a unique URL (out of scope here).

## 11.4 Diagnostics

`/admin/health` exposes service-role probes (`src/lib/diagnostics-db.functions.ts`):

- `getTableCounts` — row counts for ~27 tables
- `getMemberships` — `tenant_members` join with `tenants` + `auth.users` emails
- `getTenants` — all tenant rows
- `getAuthUsers` — `auth.users` list (admin only)

These bypass RLS by design — they're meant for SRE to confirm DB state from the Cloudflare side without leaking through policies.