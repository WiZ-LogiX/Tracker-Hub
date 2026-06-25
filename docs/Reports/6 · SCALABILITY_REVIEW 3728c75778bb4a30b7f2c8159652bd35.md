# 6 · SCALABILITY_REVIEW

<aside>
📈

**Phase 6 — Scalability Assessment.** Estimating likely bottlenecks under growth.

</aside>

## 🗄️ Database Scaling

- **State:** Supabase Postgres, RLS on every table, GUC-based session context.
- **Likely bottleneck:** RLS policies add overhead to every query; as tenants and rows grow it can become a problem without proper indexes on tenant_id.
- **Connection pooling risk:** session-based GUC with a pooler (PgBouncer transaction mode) can leak context — a security + performance risk.
- **Neon (planned):** serverless + autoscaling solves part of it, but it's not active yet.
- **Recommendation:** indexes on (tenant_id, …), partitioning for logs, and locking down the connection strategy before scaling.

## 🔌 API Scaling

- **State:** createServerFn on Cloudflare Workers (edge, stateless) — excellent for horizontal scaling.
- **Bottleneck:** all load returns to the single DB → the DB is the ceiling.
- **Recommendation:** read replicas + caching layer.

## ⚙️ Background Processing

- **State:** notifications via n8n, **no real queue/DLQ**.
- **Bottleneck:** PDF generation + media processing are sync → they block requests.
- **Recommendation:** Cloudflare Queues + background jobs for PDF/thumbnails/notifications.

## 📦 Caching & Storage

- **Caching:** signed R2 URLs cached (25-min stale), and TanStack Query on the client — good.
- **Storage growth:** R2 grows linearly with production photos (9 stages × photos × orders) → needs a lifecycle policy.
- **Recommendation:** R2 lifecycle (archive/delete), thumbnails, and a CDN for public display.

## 📊 Traffic & Deployment

- **Traffic:** edge Workers absorb spikes, but the DB does not.
- **Deployment bottleneck:** no documented migrations + no CI/CD → risky manual deploys.
- **Recommendation:** migration pipeline + blue/green + smoke tests.

## 🎯 Likely Bottlenecks (in order)

| # | Bottleneck | When it appears |
| --- | --- | --- |
| 1 | DB connection context leak (pooling) | with concurrency |
| 2 | Sync PDF/media processing | with order volume |
| 3 | RLS overhead without indexes | with row growth |
| 4 | Single DB for reads | with tenant count |
| 5 | R2 storage without lifecycle | long term |