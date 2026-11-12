# DokanWala (দোকানওয়ালা) — Production Deployment & Operations Runbook

## 1. Pre-Deployment Security & Configuration Checklist

1. **Secrets & JWT Signing (`backend/.env`):**
   - Generate a cryptographically random `JWT_ACCESS_SECRET` (at least 32 characters, never reuse development placeholders):
     ```bash
     openssl rand -base64 48
     ```
   - `backend/src/config/env.ts` fails fast at startup when `NODE_ENV=production` if `JWT_ACCESS_SECRET` uses a known development placeholder or if `CORS_ORIGINS` is empty.
2. **CORS & Reverse Proxy:**
   - Set `CORS_ORIGINS` to a comma-separated list of authorized web origins (e.g. `https://app.dokanwala.com`). Native Android apps omit the `Origin` header and connect via bearer JWT.
   - Set `TRUST_PROXY=true` when running behind Nginx, Cloudflare, Render, Railway, or Fly.io so `req.ip` and per-IP rate limiting read the real client IP accurately.
3. **Registration Policy:**
   - For single-shop dedicated hosting, set `ALLOW_PUBLIC_REGISTRATION=false` after onboarding the initial shop owner.
4. **TLS / HTTPS Enforcement:**
   - Terminate TLS 1.2/1.3 at the reverse proxy / load balancer.
   - `helmet()` automatically enables strict HSTS (`max-age=15552000; includeSubDomains`) in `NODE_ENV=production`.
   - `mobile/src/services/api/client.ts` rejects any non-`https://` `EXPO_PUBLIC_API_URL` in non-development builds.

---

## 2. Database & Migration Procedure

1. Take a PostgreSQL snapshot before deploying schema updates:
   ```bash
   pg_dump "$DATABASE_URL" --format=custom --file="pre-deploy-$(date +%F_%H%M).dump"
   ```
2. Apply pending Prisma migrations safely (never use `migrate dev` in production):
   ```bash
   cd backend
   npx prisma migrate deploy
   npx prisma migrate status
   ```
3. Composite reporting & ledger indexes verified via `EXPLAIN ANALYZE` (`20261112191136_phase9_production_indexes`):
   - `sale_returns(shop_id, returned_at DESC)`
   - `purchase_returns(shop_id, returned_at DESC)`
   - `stock_adjustments(shop_id, adjusted_at DESC)`
   - `sync_operations(shop_id, created_at DESC)` & `sync_operations(shop_id, client_op_id)`

---

## 3. Building & Starting the Production API Server

```bash
npm ci
npm run build:shared
npm run prisma:generate --workspace=backend
npm run build --workspace=backend
NODE_ENV=production npm run start --workspace=backend
```

Verify liveness & PostgreSQL connectivity:
```bash
curl -fsS https://api.yourdomain.com/api/v1/health
```

---

## 4. Android & Web Release Builds (Expo / EAS)

1. Update `EXPO_PUBLIC_API_URL` in `mobile/eas.json` (`preview` and `production` profiles) to your live `https://` API base URL.
2. Verify icons, splash assets (`mobile/assets/`), permissions (`android.permissions: []`), and version numbers in `mobile/app.json`.
3. Build Android APK (internal QA) or Android App Bundle (Google Play):
   ```bash
   cd mobile
   npx eas-cli build --platform android --profile preview      # APK
   npx eas-cli build --platform android --profile production   # AAB
   ```
4. Static web bundle check:
   ```bash
   npx expo export --platform web --output-dir dist-web
   ```

---

## 5. Shop JSON Backup Export & Validated Restore

- **Endpoints (`OWNER` only):**
  - `GET /api/v1/backup/export` — Exports all tenant business tables (`Shop`, `Category`, `Unit`, `Product`, `ProductUnit`, `InventoryBalance`, `StockMovement`, `StockAdjustment`, `Customer`, `Supplier`, `Sale`, `SaleItem`, `Payment`, `SaleReturn`, `SaleReturnItem`, `Purchase`, `PurchaseItem`, `PurchaseReturn`, `PurchaseReturnItem`, `CustomerPayment`, `SupplierPayment`, `ExpenseCategory`, `Expense`, `ExpenseAuditLog`, `CashbookSession`, `CashbookEntry`) with a canonical **SHA-256 checksum** (`checksumSha256`).
  - `POST /api/v1/backup/restore` (up to `10mb` JSON limit) — Verifies Zod schema + SHA-256 checksum, atomically replaces domain tables inside a single Prisma `$transaction` scoped strictly to the authenticated owner's `shopId`, preserves existing user accounts/password/PIN hashes, remaps UUIDs if restoring across shops, and logs `BACKUP_RESTORED` in `AuditLog`.
- **In-App Workflow:** Owner navigates to **More → Shop Backup & Restore (JSON)** (`/backup`) to download/share or pick/paste a `.json` backup.

---

## 6. Report & Thermal Receipt Exports (UTF-8 CSV + Bangla PDF)

- **Reports:** `GET /api/v1/reports/export?report={sales|products|profit-loss|dues}&format={csv|pdf}&lang={bn|en}`
  - CSV files prepend UTF-8 BOM (`\uFEFF`) for seamless Excel Bangla display and escape spreadsheet formula injection (`=`, `+`, `-`, `@`).
  - PDF files embed bundled `NotoSansBengali-Regular.ttf` & `NotoSansBengali-Bold.ttf` via `pdfkit`.
  - `profit-loss` exports are restricted to `OWNER`; `EMPLOYEE` exports strip wholesale COGS & gross profit columns.
- **Thermal / POS Receipts:** `GET /api/v1/sales/:id/receipt/pdf?lang={bn|en}` generates an 80mm-formatted PDF receipt shared or printed from the mobile Receipt screen via `expo-sharing` and `expo-print`.
