# 13. External Services

## 13.1 Supabase

- **Postgres + Auth + Storage** (legacy during R2 migration).
- **Edge functions** — `migrate-helper` (gated env probe). Note: `delete-r2-object` invocations in client code are wrapped in `try { await supabase.functions.invoke?.("delete-r2-object", …) } catch { /* ignore */ }` because the edge fn may not be deployed.
- **RLS** — every business table asserts `tenant_id ∈ is_tenant_member(...)`.

## 13.2 Cloudflare R2 (S3-compatible)

Primary object store. Bucket: `pelecanon` (eu region per `.lovable/neon-migration-plan.md`).

### CORS policy
Config matrix in `docs/R2.md` and `src/lib/r2.config.ts`:

| Field | Value |
|---|---|
| `AllowedOrigins` | production host + `http://localhost:5173` |
| `AllowedMethods` | `PUT, GET, HEAD` |
| `AllowedHeaders` | `Content-Type, Authorization` |
| `ExposeHeaders` | `ETag` |
| `MaxAgeSeconds` | `3600` |

### Visibility modes

| Entity | Default | Reason |
|---|---|---|
| `production-photos` | public via `R2_PUBLIC_URL` | Shown on the customer tracking page (`/track`) |
| `attachments` | private (`is_public=false`) | Internal — admin only |
| `avatars` | public | Pulled by other users (team page) |

Per-row override: flip `is_public` on `attachments` after insert.

### Critical checksum fix
`S3Client` is instantiated with:
```ts
requestChecksumCalculation: "WHEN_REQUIRED"
responseChecksumValidation:  "WHEN_REQUIRED"
```
Found in `src/lib/r2.functions.ts:53-57` and `src/lib/r2-views.functions.ts:67-71`. **Required**: AWS SDK v3 ≥ 3.733 pre-computes flow checksums; without the override, browsers upload real bytes and R2 returns HTTP 400 `InvalidChecksum`.

### Key strategy
`tenantId/entityType/entityId/<hash>.<ext>` — "tenant scoping is the primary isolation boundary; never bypass it" (source comment).

## 13.3 n8n webhook

- URL: `N8N_NOTIFY_WEBHOOK_URL`. Token: `N8N_WEBHOOK_TOKEN` (sent as `X-Lovable-Token`).
- 5 dispatched events (WhatsApp only):
  - `quote_sent`
  - `order_opened`
  - `stage_changed`
  - `delivery_scheduled`
  - `delivered`
- Failures and skips logged in `notification_log`; **no retry/DLQ** today.

## 13.4 Neon (forward-looking, Phase 7)

- HTTP driver `@neondatabase/serverless` is installed.
- `DATABASE_URL` secret set.
- `checkNeonConnection` server fn returns (sample run): `ok: true, host, port, db="neondb", serverVersion="PostgreSQL 18.4"`.
- See [15-debt.md](./15-debt.md): the **client is not yet switched** — `src/db/client.server.ts` still uses `postgres-js` against Supabase Postgres.