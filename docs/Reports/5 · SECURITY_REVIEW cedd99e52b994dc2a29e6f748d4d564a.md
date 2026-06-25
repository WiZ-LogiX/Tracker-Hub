# 5 · SECURITY_REVIEW

<aside>
🔐

**Phase 5 — Security Assessment.** The most critical part of the analysis. Classification: Critical / High / Medium / Low.

</aside>

## 🔴 Critical

<aside>
🔴

**1. Tenant isolation relies on RLS only (no defense-in-depth)**
Admin pages + server fns use supabaseAdmin, which bypasses RLS. Any bug = cross-tenant data leak.
**Fix:** Mandatory tenantDb() + ban supabaseAdmin outside the catalog + mandatory cross-tenant test.

</aside>

<aside>
🔴

**2. RLS bypass in catalog functions**
The "global catalog" assumption is undocumented; if any tenant data enters here = leak.
**Fix:** Explicit separation of global vs tenant tables + audit every supabaseAdmin usage.

</aside>

## 🟠 High

<aside>
🟠

**3. No granular RBAC at the UI/action level**
Roles exist but enforcement is vague — a worker may reach actions that should be forbidden.
**Fix:** permission matrix + server-side checks in every server fn.

</aside>

<aside>
🟠

**4. n8n webhook with no documented auth contract (HMAC?)**
If the webhook is open = notification injection/spoofing.
**Fix:** HMAC signature + IP allowlist + replay protection.

</aside>

<aside>
🟠

**5. Public tracking token**
If the token is weak/guessable = order data exposure.
**Fix:** long random token + short-TTL signed URLs for images + is_public flag.

</aside>

## 🟡 Medium

<aside>
🟡

**6. synthetic email auth (@pelecanon.local)** — a hack that can cause collisions / reset difficulty. Fix: migration plan to proper identity.

</aside>

<aside>
🟡

**7. Undocumented secrets handling** — where are R2 keys/DB creds? Fix: secrets manager + rotation policy.

</aside>

<aside>
🟡

**8. No EXIF stripping/validation on images** — GPS/metadata leak. Fix: strip EXIF + mime/size validation (covered in the R2 prompt).

</aside>

## 🟢 Low

<aside>
🟢

**9. Dependency risk** — no documented SCA/Dependabot. Fix: automated dependency scanning.

</aside>

<aside>
🟢

**10. Injection** — Drizzle/parameterized reduces risk, but the untyped raw access needs review.

</aside>

## 🛡️ Security Posture Summary

| Area | State |
| --- | --- |
| Authentication | Acceptable (Supabase) but built on a hack |
| Authorization | Weak (RLS-only + no granular RBAC) |
| Data isolation | Critical |
| Secrets | Undocumented |
| Third-party | Medium |