# 8 · AGENT_CONTEXT

<aside>
🤖

**Phase 8 — AI Agent Operational Context.** This file lets any new AI agent contribute immediately without reading all the documentation.

</aside>

## 📋 Project Summary

PeleCanon: a pricing + furniture manufacturing tracking SaaS, multi-tenant, heading toward a general Manufacturing SaaS.

## 🏗️ Architecture Summary

- **Frontend:** TanStack Start + React 19 + Router/Query v5, shadcn/ui + Tailwind v4 (Emerald Prestige oklch, Cairo/Playfair/Inter), recharts, i18next (ar/en/fr), date-fns.
- **Backend:** createServerFn in src/lib/*.functions.ts (no REST), on Cloudflare Workers (wrangler.jsonc).
- **Data:** Drizzle ORM + Supabase Postgres, ~33 tenant-scoped tables, RLS via is_tenant_member().
- **Storage:** Cloudflare R2 (bucket pelecanon, presigned @aws-sdk/client-s3).
- **Integrations:** n8n WhatsApp webhook.

## 🔑 Critical Workflows

1. Lead→Quote (runFormula + 14% VAT).
2. Quote→Order→Invoice (needs a transaction).
3. Production 9 stages + QC.
4. Customer tracking (token + R2 gallery).

## 📁 Critical Files

| File | Role |
| --- | --- |
| src/lib/pricing/engine.ts | The DSL pricing engine (source of truth) |
| src/lib/pricing.ts | Simple calculation (divergence risk) |
| src/lib/stages.ts | 9 production stages |
| src/lib/*.functions.ts | All the API |
| wrangler.jsonc | Workers/R2 config |

## 📜 Coding Conventions

- Server logic = createServerFn only (no REST).
- Every tenant-scoped table must have tenant_id NOT NULL + RLS.
- Logs are append-only (audit/notification/internal_notes) — no update/delete.
- pricing rule versions are immutable — no historical edits.
- formatEGP via Intl ar-EG, 14% VAT.
- R2 key: tenant/<entityType>/<entityId>/<hash>.<ext>, checksum WHEN_REQUIRED.

## 📐 Business Rules

- 14% VAT fixed; discounts + delivery (note: delivery was later removed from scope).
- RFQ only (no e-commerce checkout).
- Roles: owner/admin/sales/worker/viewer.
- No self-signup — admin creates users.

## ⚠️ Known Risks

- RLS-only isolation (Critical).
- Two parallel pricing engines.
- No transactions/tests/observability/PDF/DLQ.
- catalog bypasses RLS via supabaseAdmin.

## ❓ Open Questions

- When does Neon become the primary?
- Which pricing engine is officially the truth?
- What is the n8n webhook auth contract?
- What is the migration plan away from synthetic emails?

## 🔮 Future Roadmap (brief)

0-3 months: security + tests + transactions + observability (opencode P0-P7). 3-6: AI + realtime + Neon. 6-12: multi-industry Manufacturing SaaS.