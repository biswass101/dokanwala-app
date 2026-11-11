# DokanWala (দোকানওয়ালা) — REST API Design Conventions

> **Base Path:** `/api/v1`  
> **Content-Type:** `application/json; charset=utf-8`  
> **Timestamps:** UTC ISO-8601 (`2026-11-12T06:00:00.000Z`); business date filters (`date=YYYY-MM-DD`) evaluated in shop timezone (`Asia/Dhaka`, `UTC+06:00`)

---

## 1. Standard Request & Response Conventions

### 1.1 Standard Headers
| Header | Required | Purpose |
|---|---|---|
| `Authorization` | Protected routes | `Bearer <jwt_access_token>` |
| `X-Idempotency-Key` | All financial `POST` mutations | Client-generated UUID v4 preventing duplicate sales, payments, purchases, or expenses |
| `X-Device-Id` | Recommended on auth & sync | Stable device identifier for audit & session revocation |
| `Accept-Language` | Optional (`bn` default, `en`) | Hint for server error fallback messaging |
| `X-Request-Id` | Optional (server generates if absent) | End-to-end log correlation |

### 1.2 Standard Response Envelopes

**Success (Single Resource or Mutation):**
```json
{
  "success": true,
  "data": {
    "id": "b6d9f1a0-7f4e-4c11-9e1c-10e2d8a1f3c2",
    "receiptNumber": "INV-20261112-0001",
    "totalPoisha": 45000
  },
  "meta": {
    "requestId": "req_01JCA...",
    "timestamp": "2026-11-12T06:15:30.120Z"
  }
}
```

**Success (Paginated List):**
```json
{
  "success": true,
  "data": [],
  "meta": {
    "requestId": "req_01JCA...",
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 142,
      "totalPages": 8,
      "nextCursor": "17842"
    }
  }
}
```

**Error Response (Never exposes stack traces or raw DB/Prisma messages in production):**
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock for product.",
    "details": {
      "productId": "550e8400-e29b-41d4-a716-446655440000",
      "requestedBase": "250",
      "availableBase": "120"
    },
    "requestId": "req_01JCA..."
  }
}
```
> **Bangla UX Rule:** The mobile app maps `error.code` via `i18next` to natural Bangla shopkeeper messages (e.g., `INSUFFICIENT_STOCK` -> `"পর্যাপ্ত স্টক নেই (মজুত আছে: ১২০ গ্রাম)"`) while still carrying structured `details` for numeric interpolation.

---

## 2. HTTP Status Codes & Error Code Dictionary

| HTTP Status | `error.code` | Meaning |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Zod schema validation failure (`details.fieldErrors` included) |
| `400` | `INVALID_UNIT_CONVERSION` | Unit does not belong to product or conversion factor invalid |
| `401` | `UNAUTHORIZED` | Missing/expired/invalid access token |
| `401` | `INVALID_CREDENTIALS` | Wrong phone/password or wrong quick PIN |
| `403` | `FORBIDDEN_ROLE` | Employee attempting Owner-only action (e.g. Profit report, Purchase, Wastage) |
| `403` | `ACCOUNT_LOCKED` | Too many failed PIN/password attempts |
| `404` | `RESOURCE_NOT_FOUND` | Entity missing or belongs to another shop (never leak cross-tenant existence) |
| `409` | `VERSION_CONFLICT` | Optimistic lock mismatch (`expectedVersion` != server `version`); includes `serverState` |
| `409` | `INSUFFICIENT_STOCK` | Requested sale/wastage exceeds available stock (unless policy allows) |
| `409` | `DUPLICATE_RESOURCE` | Duplicate barcode, phone, or unique business key |
| `409` | `RETURN_EXCEEDS_SOLD` | Sale return quantity exceeds remaining unreturned quantity |
| `422` | `BUSINESS_RULE_VIOLATION` | e.g., Credit sale without customer, payment exceeding due without advance flag |
| `429` | `RATE_LIMITED` | Too many requests from IP/user |
| `500` | `INTERNAL_ERROR` | Unexpected failure (logged with `requestId` in Pino; sanitized message returned) |

---

## 3. Monetary, Quantity & Timezone Conventions

- **Monetary Fields:** Named with `Poisha` suffix (`totalPoisha`, `discountPoisha`, `paidPoisha`, `duePoisha`) as non-negative (or signed delta) integers (`1 BDT = 100 poisha`).
- **Decimal Quantities & Unit Costs:** Transmitted as decimal strings (`"250"`, `"1.5"`, `"0.855000"`) and validated with strict numeric regexes + `decimal.js` to avoid IEEE-754 JSON rounding issues.
- **Timezone Day Boundaries:** When querying `GET /reports/daily?date=2026-11-12` or Dashboard "Today", the backend converts `2026-11-12 00:00:00` to `2026-11-12 23:59:59.999` in **`Asia/Dhaka` (`UTC+06:00`)** into exact UTC boundaries `[2026-11-11T18:00:00.000Z, 2026-11-12T17:59:59.999Z]` so early-morning shop openings (e.g., 5:30 AM BST) never fall into the wrong calendar day!

---

## 4. Complete Endpoint Inventory

### Health & System
- `GET /api/v1/health` — Liveness & PostgreSQL connectivity check (no secrets exposed).

### Auth & Sessions (`/auth`)
- `POST /api/v1/auth/register` — Owner & initial Shop bootstrap (if enabled)
- `POST /api/v1/auth/login` — Phone + Password login -> JWT + Refresh token + Shop summary
- `POST /api/v1/auth/pin-login` — Phone/UserId + 4–6 digit PIN login (strict rate limit)
- `POST /api/v1/auth/refresh` — Rotate refresh token & issue new access token
- `POST /api/v1/auth/logout` — Revoke current refresh session
- `POST /api/v1/auth/pin` — Set or change Quick PIN (requires password verification)
- `GET /api/v1/auth/me` — Current user & shop profile

### Shop & Users (`/shop`)
- `GET /api/v1/shop` — Shop profile & receipt/language settings
- `PATCH /api/v1/shop` — Update shop name, address, logo, language, receipt config (Owner)
- `GET /api/v1/shop/users` — List staff accounts (Owner)
- `POST /api/v1/shop/users` — Create employee account (Owner)
- `PATCH /api/v1/shop/users/:id` — Toggle active status / reset employee PIN (Owner)

### Catalog & Units (`/categories`, `/units`, `/products`)
- `GET / POST / PATCH / DELETE(archive) /api/v1/categories`
- `GET / POST / PATCH /api/v1/units`
- `GET /api/v1/products` — Bilingual search (`?q=...`), category filter, `?lowStockOnly=true`, `?includeInactive=false`
- `POST /api/v1/products` — Create product + initial `ProductUnit`s + optional opening stock
- `GET / PATCH / DELETE(archive) /api/v1/products/:id`
- `PUT /api/v1/products/:id/units` — Configure product unit conversions & unit prices

### Inventory (`/inventory`)
- `GET /api/v1/inventory/alerts` — Low-stock products list
- `GET /api/v1/inventory/movements` — Paginated stock movement ledger (`?productId=...&type=...`)
- `GET /api/v1/inventory/valuation` — Total inventory value at current WAC (Owner)
- `POST /api/v1/inventory/adjustments` — Record Wastage (`WASTAGE`), Damage (`DAMAGE`), Expiry (`EXPIRED`), or Physical Count (`COUNT_ADJUST`) (requires `X-Idempotency-Key`)

### Sales & POS (`/sales`)
- `GET /api/v1/sales` — Paginated sales history (`?from=&to=&status=&customerId=`)
- `POST /api/v1/sales` — Create POS sale (recalculates totals, splits payments, supports credit/বাকি; requires `X-Idempotency-Key`)
- `GET /api/v1/sales/:id` — Full sale details + receipt data + returns
- `POST /api/v1/sales/:id/returns` — Partial/full sales return + refund or credit adjustment (requires `X-Idempotency-Key`)
- `POST /api/v1/sales/:id/cancel` — Void/cancel sale with reason + stock/cash reversal (Owner, requires `X-Idempotency-Key`)

### Purchases & Suppliers (`/suppliers`, `/purchases`)
- `GET / POST / PATCH /api/v1/suppliers`
- `GET /api/v1/suppliers/:id/ledger` — Chronological purchases + supplier payments
- `POST /api/v1/suppliers/:id/payments` — Record supplier due payment (requires `X-Idempotency-Key`)
- `GET / POST /api/v1/purchases` — List & create multi-item purchase (updates stock & WAC; requires `X-Idempotency-Key`)
- `GET /api/v1/purchases/:id`
- `POST /api/v1/purchases/:id/returns` — Record purchase return to supplier

### Customers & Expenses (`/customers`, `/expenses`)
- `GET / POST / PATCH /api/v1/customers` (`?withDuesOnly=true`)
- `GET /api/v1/customers/:id/ledger` — Credit purchases + due collections
- `POST /api/v1/customers/:id/payments` — Collect outstanding customer due (requires `X-Idempotency-Key`)
- `GET / POST /api/v1/expense-categories`
- `GET / POST / PATCH /api/v1/expenses` (PATCH writes `ExpenseAuditLog` + delta cashbook entry)
- `GET /api/v1/expenses/:id/history` — Expense edit audit trail

### Cashbook, Reports & Backup (`/cashbook`, `/reports`, `/backup`)
- `GET /api/v1/cashbook/session?date=YYYY-MM-DD`
- `POST /api/v1/cashbook/open` — Record opening cash balance
- `POST /api/v1/cashbook/close` — Record closing cash count & variance
- `GET /api/v1/cashbook/entries` — Cash/MFS ledger (`?from=&to=&method=`)
- `GET /api/v1/reports/dashboard` — Today's KPI cards + recent transactions
- `GET /api/v1/reports/sales` — Daily / Weekly / Monthly summary (`?period=daily|weekly|monthly`)
- `GET /api/v1/reports/products` — Product-wise sales & best-selling items
- `GET /api/v1/reports/profit-loss` — Full P&L including COGS, discounts, returns, expenses, wastage (Owner)
- `GET /api/v1/reports/dues` — Customer receivables & Supplier payables summary
- `GET /api/v1/reports/export` — CSV (UTF-8 BOM) / PDF export stream
- `GET /api/v1/backup/export` & `POST /api/v1/backup/restore` (Owner)

### Offline Sync (`/sync`)
- `POST /api/v1/sync/push` — Batch/ordered outbox execution with per-op idempotency & conflict responses
- `GET /api/v1/sync/pull?cursor=<syncSeq>&limit=200` — Incremental delta feed since last monotonic `syncSeq`
