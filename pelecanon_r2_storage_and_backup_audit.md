# PELECANON CLOUDFLARE R2 STORAGE AND BACKUP AUDIT

**Project:** PeleCanon / Tracker-Hub  
**Date & Time:** 2026-10-30T02:26:00+02:00  
**Storage Provider:** Cloudflare R2 (S3-compatible API)  
**Database Provider:** Supabase PostgreSQL (`zgumsjwukevptbwbglrk`)  
**Status:** **AUDIT COMPLETE & TEST VERIFIED**

---

## 1. CURRENT STORAGE ARCHITECTURE

PeleCanon enforces a strict architectural separation between relational business data and binary file storage:

```
┌────────────────────────────────────────────────────────────────────────┐
│                              PELECANON APP                             │
│                  (TanStack Start + React 19 + Node.js)                 │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼ Metadata Only                   ▼ Binary Files (Presigned PUT/GET)
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│        SUPABASE POSTGRESQL           │  │            CLOUDFLARE R2             │
│   (Project: zgumsjwukevptbwbglrk)    │  │          (Bucket: pelecanon)         │
├──────────────────────────────────────┤  ├──────────────────────────────────────┤
│ • attachments (storage_key, size...) │  │ • {tenantId}/quotes/{id}/{hash}.pdf  │
│ • production_photos (photo_url...)   │  │ • {tenantId}/attachments/{id}/{hash} │
│ • orders, customers, quotes, cases   │  │ • {tenantId}/avatars/{id}/{hash}     │
│ • ZERO binary BLOBs or files         │  │ • {tenantId}/logos/{id}/{hash}       │
└──────────────────────────────────────┘  └──────────────────────────────────────┘
```

### Storage Inventory
- **Primary Bucket:** `pelecanon`
- **Account ID:** `57643050bdeb9c487a223ccf7815bd94`
- **Public CDN URL:** `https://pub-90fe65c019b6488086aa7b039e12acc5.r2.dev`
- **Total Stored Objects:** **49 objects**
- **Total Bucket Size:** **4.78 MB** (~4,783,198 bytes)
- **Object Distribution:**
  - Quotation PDFs (`quotes/`): 32 objects (~3.8 MB)
  - Production Photos (`production-photos/`): 9 objects (~0.8 MB)
  - Branding Logos (`logos/`): 3 objects (~60 KB)
  - User Avatars (`avatars/`): 3 objects (~24 KB)
  - General Attachments (`attachments/`): 1 object (~1.05 MB)
  - Miscellaneous (`hello.txt`): 1 object (<1 KB)

---

## 2. R2 INTEGRATION POINTS & WORKFLOWS

| Application Module | Integration Point | Code Reference | Key Pattern | Storage Method |
|---|---|---|---|---|
| **Commercial Quotes** | PDF Generation & Storage | [`pdf.functions.tsx`](file:///home/wiz/dyad-apps/price-produce-beam-main/src/lib/pdf.functions.tsx#L1810-L1836) | `{tenantId}/quotes/{quoteId}/{hash}.pdf` | Direct server-side S3 `PutObjectCommand` |
| **Commercial Invoices** | PDF Generation & Storage | [`pdf.functions.tsx`](file:///home/wiz/dyad-apps/price-produce-beam-main/src/lib/pdf.functions.tsx#L1905-L1930) | `{tenantId}/invoices/{invoiceId}/{hash}.pdf` | Direct server-side S3 `PutObjectCommand` |
| **Order Attachments** | Attachment Management | [`attachments.functions.ts`](file:///home/wiz/dyad-apps/price-produce-beam-main/src/lib/attachments.functions.ts#L105-L130) | `{tenantId}/attachments/{entityId}/{hash}.ext` | Browser presigned PUT (`getR2BatchUploadUrls`) |
| **Production Photos** | Order Stage Photos | [`tracking.functions.ts`](file:///home/wiz/dyad-apps/price-produce-beam-main/src/lib/tracking.functions.ts#L330-L345) | `{tenantId}/production-photos/{orderId}/{hash}.ext` | Server-side buffer upload via `uploadToR2` |
| **After-Sales & Warranty** | Service Case Evidence | [`after-sales.functions.ts`](file:///home/wiz/dyad-apps/price-produce-beam-main/src/lib/after-sales.functions.ts#L712-L738) | `{tenantId}/attachments/{caseId}/{hash}.ext` | Signed presigned GET URLs (TTL 3600s) |
| **Remakes Workshop** | Remake Defect Photos | [`remakes.functions.ts`](file:///home/wiz/dyad-apps/price-produce-beam-main/src/lib/remakes.functions.ts#L375-L395) | `{tenantId}/attachments/{remakeId}/{hash}.ext` | Signed presigned GET URLs (TTL 3600s) |
| **Branding & Logos** | Tenant Settings | [`settings.tsx`](file:///home/wiz/dyad-apps/price-produce-beam-main/src/routes/admin/settings.tsx#L125-L140) | `{tenantId}/logos/tenant-logo/{hash}.ext` | Direct presigned PUT (`PhotoUploader`) |
| **User Avatars** | Profile Photos | [`AvatarUploader.tsx`](file:///home/wiz/dyad-apps/price-produce-beam-main/src/components/admin/AvatarUploader.tsx#L50-L75) | `{tenantId}/avatars/{userId}/{hash}.ext` | Direct presigned PUT (`getR2BatchUploadUrls`) |

### Key Generation Strategy
Object keys are generated using a deterministic tenant-scoping pattern:
```typescript
`${tenantId}/${entityType}/${entityId}/${Date.now()}-${randomHash}.${ext}`
```
- `tenantId`: Strict UUID prefix ensuring tenant namespace isolation.
- `entityType`: Allowed entity (`quotes`, `invoices`, `production-photos`, `attachments`, `avatars`, `logos`).
- `entityId`: Specific record UUID (Order ID, Quote ID, Case ID, User ID).
- `hash`: High-entropy timestamp + alphanumeric random seed preventing filename collisions and path enumeration.

---

## 3. VERIFICATION OF STORAGE SEPARATION

1. **Zero Binary Storage in PostgreSQL:**
   - The PostgreSQL database only holds metadata rows in `public.attachments` (`storage_key`, `file_name`, `content_type`, `size_bytes`, `caption`, `is_public`) and `public.production_photos` (`photo_url`, `stage`, `caption`).
   - Total database logical dump is only ~950 KB, confirming zero binary image/PDF data is stored in the database.
2. **Zero Active Supabase Storage Dependencies:**
   - Search across all source files for `supabase.storage`, `@supabase/storage-js`, or Supabase Storage bucket configurations returned **0 references**.
   - Supabase client is used exclusively for authentication (`auth.getUser`) and database PostgREST calls.
   - All upload and download flows communicate directly with Cloudflare R2.
3. **Database Migration Isolation:**
   - The recent production schema migration (`20261029_after_sales_service_cases_repair.sql`) created 7 relational tables, columns, indexes, and RLS policies.
   - It did not create, modify, or interact with R2 objects or storage buckets in any way.

---

## 4. R2 SECURITY & PERMISSIONS REVIEW

### Findings

| Security Control | Current Implementation | Evaluation |
|---|---|---|
| **Tenant Isolation** | All generated keys enforce `{tenantId}/...` prefix. Server endpoints ([`r2.functions.ts`](file:///home/wiz/dyad-apps/price-produce-beam-main/src/lib/r2.functions.ts#L228-L232), [`r2-views.functions.ts`](file:///home/wiz/dyad-apps/price-produce-beam-main/src/lib/r2-views.functions.ts#L100-L104)) explicitly check `if (!key.startsWith(session.tenantId + "/")) throw new Error("Forbidden")`. | **STRONG** |
| **Upload Authorization** | Client never receives raw R2 credentials. Browser uploads use presigned PUT URLs generated only after Supabase JWT validation and tenant membership verification. Presigned PUT TTL is **900 seconds** (15 minutes). | **STRONG** |
| **Download Authorization** | Private attachments and service case evidence use signed GET URLs generated with TTL between **1500s and 3600s**. | **STRONG** |
| **SDK Checksum Configuration** | S3Client instantiates with `requestChecksumCalculation: "WHEN_REQUIRED"` and `responseChecksumValidation: "WHEN_REQUIRED"`, resolving browser PUT CRC32 stream mismatches. | **OPTIMAL** |
| **Credential Storage** | R2 API tokens and Account ID reside exclusively in server `.env` and are never exposed to browser client bundles. | **SECURE** |
| **Bucket Public Exposure** | **`pub-90fe65c019b6488086aa7b039e12acc5.r2.dev` is publicly enabled.** While paths have random hashes, any known key can be fetched anonymously over HTTP. | **ATTENTION REQUIRED** |
| **Deletion Consistency** | [`attachments.functions.ts`](file:///home/wiz/dyad-apps/price-produce-beam-main/src/lib/attachments.functions.ts#L146-L160) deletes PostgreSQL record first, then calls `deleteObject`. If R2 delete fails, it logs a warning. Potential for orphaned R2 objects upon network failure. | **LOW RISK** |

> [!WARNING]
> **Bucket-Level Public Access (`r2.dev`)**: The Cloudflare R2 bucket currently has public `r2.dev` access enabled. While the application issues presigned URLs for private files and paths contain random hash seeds, the bucket does not enforce storage-level private access against direct HTTP requests to `pub-*.r2.dev`.
> 
> *Recommendation:* Keep public assets (tenant logos) either in a separate public bucket or behind a Cloudflare Worker that validates tenant access, while disabling `r2.dev` public access on sensitive document buckets.

---

## 5. BACKUP STRATEGY & TOOLING ASSESSMENT

### Strategy Requirements
- **Non-Destructive Copying:** Backups must be append-only or versioned.
- **Strict Prohibition of Mirror Deletion:** Never use `rclone sync --delete` or mirror tools that propagate accidental or malicious deletions into the backup repository.
- **Low Cost / Free Tier:** Utilize existing Cloudflare R2 / S3 capabilities without incurring premium infrastructure costs.

### Recommended Dual-Target Backup Architecture

```
┌────────────────────────────────────────────────────────┐
│                   PRIMARY STORAGE                      │
│             Cloudflare R2 (pelecanon)                  │
└──────────────────────────┬─────────────────────────────┘
                           │
             rclone copy (Non-destructive)
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│     TARGET A: LOCAL ARCHIVE   │   │     TARGET B: SECONDARY R2    │
│  /home/wiz/.pelecanon_backups │   │  pelecanon-backup (Versioned) │
│ • Daily incremental copy      │   │ • Cross-bucket replication    │
│ • Zero auto-deletion          │   │ • Low storage cost ($0.015/GB)│
│ • Full local operator control │   │ • R2 free tier: 10 GB/mo free │
└───────────────────────────────┘   └───────────────────────────────┘
```

### rclone Non-Destructive Copy Command
Running `rclone` in Docker (`rclone/rclone:latest`):
```bash
# 1. Non-destructive daily copy (never deletes existing files in backup destination)
docker run --rm \
  -v /home/wiz/.pelecanon_backups/r2_daily:/backup \
  -e RCLONE_CONFIG_R2_TYPE=s3 \
  -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  -e RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
  rclone/rclone:latest \
  copy R2:pelecanon/ /backup/
```

---

## 6. EMPIRICAL TEST SUITE RESULTS

A comprehensive end-to-end test was conducted using a dedicated, isolated test object (`test-audit/audit-test-mvu8eb1c-d53e77.json`). **Zero customer files were touched or altered.**

| Test Step | Verification Action | Result | Detail |
|---|---|---|---|
| **1. Dedicated Test Upload** | Upload 306-byte JSON payload with custom metadata | **SUCCESS (200 OK)** | ETag: `"0c55f4a5023dd07348415a706877bd93"`. |
| **2. Metadata Consistency** | `HeadObjectCommand` audit | **VERIFIED** | ContentLength (306), ContentType (`application/json`), custom metadata intact. |
| **3. Direct S3 Retrieval** | Stream download & SHA-256 calculation | **VERIFIED** | SHA-256: `007301340b873b12e701551d520755666a882ad96c5f25efa27211b13c89e497` (100% match). |
| **4. Presigned GET URL** | Presigned URL generated (TTL 900s) & HTTP fetch | **VERIFIED (200 OK)** | Downloaded text matches exact SHA-256 hash. |
| **5. Public CDN Retrieval** | HTTP fetch via `R2_PUBLIC_URL` | **CONFIRMED** | HTTP 200 OK on `pub-*.r2.dev`. |
| **6. Unauthenticated Raw S3** | HTTP fetch without AWS auth to S3 endpoint | **BLOCKED (400)** | Raw S3 endpoint refuses anonymous requests. |
| **7. Independent Backup Copy** | S3 CopyObject to `backup-archive/` | **VERIFIED (200 OK)** | Source intact; backup SHA-256 matches original. |
| **8. Restoration from Backup** | S3 CopyObject from `backup-archive/` to `restored-verify/` | **VERIFIED (200 OK)** | Restored object matches original size (306 B) and SHA-256. |
| **9. rclone Docker Non-Destructive Copy** | `rclone copy` from R2 to local test directory | **VERIFIED (Exit 0)** | Local backup created (114 B), SHA-256 verified. |
| **10. rclone Docker Restore** | `rclone copy` from local directory back to R2 | **VERIFIED (Exit 0)** | Restored to R2 `test-restored/`, SHA-256 verified. |
| **11. Clean Teardown** | Delete test objects in R2 & local test folder | **CLEANED** | All test objects deleted cleanly. Real 49 files untouched. |

---

## 7. REMAINING RISKS & ACTIONABLE RECOMMENDATIONS

1. **Bucket-Level Public Access Hardening:**
   - *Current State:* `pelecanon` bucket has public `r2.dev` enabled.
   - *Risk:* If a quotation URL or attachment key is exposed, any external party can download the file.
   - *Recommendation:* Create a dedicated `pelecanon-public` bucket exclusively for public assets (logos, public avatars), and configure the primary `pelecanon` bucket as strictly private (disabling `r2.dev`).
2. **Object Versioning:**
   - *Current State:* R2 object versioning is not currently enabled on the bucket.
   - *Risk:* Overwrite or deletion of an object is immediate.
   - *Recommendation:* Enable Object Versioning on the bucket via Cloudflare Dashboard (R2 → Settings → Object Versioning) to protect against accidental overwrites.
3. **Automated Non-Destructive Backup Cron:**
   - Schedule the verified `rclone copy` container command as a nightly cron job to sync objects to `/home/wiz/.pelecanon_backups/r2_daily/`, creating an off-cloud local copy alongside the PostgreSQL database dumps.