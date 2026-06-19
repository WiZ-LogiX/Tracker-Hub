# 6. Data Flow

## 6.1 Quote → Order (the canonical business path)

```
[Admin] /admin/quotes/new or /admin/quotes/configurator
  [Browser] compute total via runFormula / calculateLine using local pricing_factors + materials
  [Browser] inserts into `quotes` (quote_number = PLC-XXXXX, customer_id, total, snapshot)
  [Browser] inserts into `quote_items` (per-item breakdown JSON, accessories)

[Admin] /admin/quotes/$id → click "تحويل لفاتورة وأمر إنتاج"
  [Browser] invoke createInvoiceFromQuote({ data: { quoteId, customerId, plcId } })
    server: resolves tenant_id, copies totals + snapshot, sets status='converted'
  [Browser] invoke createOrder({ data: { quoteId, invoiceId, customerId, plcId } })
    server: links via quote_id/invoice_id, sets current_stage='deposit_received', expected_delivery=now+30d
  [Browser] optional notify({ data: { event:'order_opened', entityType:'order', entityId }})

[Admin] /admin/orders — advance stages … loop …
[Customer] /track?ref={quote.quote_number || order.order_number || invoice.invoice_number}
  server: getPublicTrackingByRef looks up order_number first, then quote, invoice, quote_request
```

### 6.1.1 Code entry points
- `src/routes/admin/quotes/new.tsx` — legacy product list + accessories builder
- `src/routes/admin/quotes/configurator.tsx` — free-form template + wastage_rules lookup
- `src/routes/admin/quotes/$id.tsx` — detail + convertToInvoice+Order
- `src/lib/invoice.functions.ts` — `createInvoiceFromQuote`
- `src/lib/order.functions.ts` — `createOrder`

## 6.2 Photo upload to R2

```
UI PhotoUploader.handlePick(files)
  → getR2BatchUploadUrls({ files, entityType:'production-photos', entityId:orderId })
    server signs each → { uploads: [{key, uploadUrl, publicUrl}] }
  → probePreflight(uploadUrl)        // OPTIONS preflight, raises on 4xx
  → fetch(uploadUrl, { method:'PUT', body, headers:{ Content-Type } })
[Browser] supabase.from('production_photos').insert(rows)
```

## 6.3 Avatar upload

```
AvatarUploader.onPick(file)
  → resizeImage(file) → webp ≤512×512 (OffscreenCanvas or fallback canvas)
  → getR2BatchUploadUrls({ files:[{filename, contentType:'image/webp'}], entityType:'avatars', entityId:userId })
  → fetch(uploadUrl, PUT, blob)        // direct
  → updateUserAvatar({ data:{ userId, avatarKey } })
```

## 6.4 Notification dispatch

```
UI click on a notification trigger
  → sendNotification({ event, entityType, entityId, extra?, language? })
      ├─ load entity (quote/order/invoice) via supabaseAdmin
      ├─ read template from notification_templates (locale → fallback 'en')
      ├─ render subject + body with variable substitution
      ├─ POST to N8N_NOTIFY_WEBHOOK_URL with optional X-Lovable-Token
      └─ insert notification_log row (status: sent / failed / skipped)
```

## 6.5 Customer tracking lookup

`getPublicTrackingByRef` falls back through four reference tables in this order:

1. `orders.order_number`
2. `quotes.quote_number` → orders via `quote_id`
3. `invoices.invoice_number` → orders via `invoice_id`
4. `quote_requests.reference_number` (deprecated path)

On the way back, `production_logs` + `production_photos` are joined; photo URLs are routed through `signPhotos` which extracts R2 keys and re-signs GETs with a 30-min TTL (cached in-memory).