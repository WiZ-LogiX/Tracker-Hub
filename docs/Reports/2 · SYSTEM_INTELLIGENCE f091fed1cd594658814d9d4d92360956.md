# 2 · SYSTEM_INTELLIGENCE

<aside>
🔬

**Phase 2 — System Understanding.** What the system really does, and what actually matters.

</aside>

## 🎯 What the System Really Does

At its core, PeleCanon is a **deterministic pricing engine + a furniture manufacturing lifecycle tracker**, built multi-tenant. The real value isn't the CRUD — it's **auditable pricing accuracy** and **production-stage transparency for the customer**.

## 💎 Core Business Value

- **Versioned pricing** — every quote is bound to an immutable rule version → trust + legal auditability.
- **Customer transparency** — the /track page reduces "where's my order" calls.
- **Customer data isolation** — the foundation for becoming a real SaaS.

## 🚶 Critical User Journeys

1. **Lead → Quote:** enter specs → runFormula → price + 14% VAT.
2. **Quote → Order:** acceptance + deposit → start production lifecycle.
3. **Production lifecycle:** 9 stages with a QC gate + worker assignments.
4. **Customer tracking:** public tracking via token.
5. **Admin/team mgmt:** create users (synthetic email) — no self-signup.

## 🧱 Critical Components

| Component | Role | Criticality |
| --- | --- | --- |
| pricing/engine.ts (runFormula) | The DSL pricing engine | Critical |
| stages.ts | Production lifecycle | Critical |
| RLS + is_tenant_member() | Data isolation | Critical |
| R2 media pipeline | Images/documents | High |
| n8n WhatsApp webhook | Notifications | Medium |

## 💥 Failure Domains & Single Points of Failure

- **SPOF 1 — Supabase Postgres:** all data + RLS (any outage = full downtime + isolation collapse).
- **SPOF 2 — RLS alone for isolation:** any policy mistake = cross-tenant leak.
- **SPOF 3 — Cloudflare R2:** all media; no fallback.
- **SPOF 4 — n8n:** if it falls over with no retry/DLQ = notifications silently lost.
- **Failure domain — catalog via supabaseAdmin:** bypasses RLS → one mistake here = global leak.

## 🗄️ Most Important Data

- **pricing rule versions** (immutable) — if changed historically = collapse of legal trust.
- **orders + stage history** — operational truth.
- **append-only logs** (audit/notification/internal_notes) — for auditing.
- **tenant_members** — the security key.

## 🌀 Hidden Complexity

- **Two pricing engines** — silent complexity: which one is the truth? Divergence risk.
- **immutability triggers + append-only** — any bad transaction can fail in non-obvious ways.
- **R2 checksum WHEN_REQUIRED + OPTIONS preflight** — fragile details; if changed they break uploads (400 InvalidChecksum).
- **synthetic email auth** — hidden complexity in the login flow.
- **multi-tenancy relies on GUC/session** — if connection pooling is misconfigured = context leakage.