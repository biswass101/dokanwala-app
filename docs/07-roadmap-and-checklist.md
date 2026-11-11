# DokanWala (দোকানওয়ালা) — Development Roadmap & Implementation Checklist

> **Workflow Rule:** Development proceeds strictly one phase at a time. Each phase ends with a Phase Completion Report and **STOPS** for user review, testing, and manual Git commit before the next phase begins.

---

## 1. Phase-by-Phase Roadmap & Checklists

### Phase 0 — Project Discovery and Architecture *(Current Phase)*
- [x] Inspect workspace and local environment (Node v24, Docker Compose, Postgres port check)
- [x] Confirm functional, financial, security, offline-first, and high-priority Bangla requirements
- [x] Define monorepo, backend, mobile, and `packages/shared` folder structures ([`01-architecture.md`](./01-architecture.md))
- [x] Define normalized database design, ERD, indexes, soft deletes, transaction boundaries, and WAC costing ([`02-database-design.md`](./02-database-design.md))
- [x] Define REST API envelopes, error codes, timezone boundaries, and endpoint inventory ([`03-api-conventions.md`](./03-api-conventions.md))
- [x] Define offline-first SQLite outbox + idempotent sync protocol ([`04-offline-sync-design.md`](./04-offline-sync-design.md))
- [x] Define security architecture, RBAC, offline PIN unlock, and residual risks ([`05-security-architecture.md`](./05-security-architecture.md))
- [x] Define design system, Bangla typography, numeral/date utilities, and navigation ([`06-design-system-and-bangla-ux.md`](./06-design-system-and-bangla-ux.md))
- [x] **Phase 0 approved by user to proceed; 4 optional business-policy questions remain open for Phase 2–4 confirmation**

### Phase 1 — Project Foundation
- [x] Initialize root npm workspace, `.gitignore`, `.editorconfig`, `docker-compose.yml` (Postgres on `5433`, test Postgres on `5434`)
- [x] Initialize `packages/shared` (strict TS, `decimal.js` Poisha money math, Bangla numeral normalizer & BDT formatter, unit conversion math, unit tests)
- [x] Initialize `backend/` (Express 5 + strict TS, Prisma + PostgreSQL, Zod env config, Pino logger with redaction, Helmet/CORS/RateLimit, centralized error handler, `/api/v1/health` endpoint, Supertest smoke test)
- [x] Initialize `mobile/` (Expo SDK 58 + Expo Router + NativeWind v4 + Tailwind v3.4 + strict TS, `Noto Sans Bengali` & `Inter` fonts, `i18next` `bn`/`en` foundation, Axios client skeleton, 5-tab navigation shell, initial UI Design System primitives: `Button`, `Card`, `Input`, `NumericInput`, `LoadingView`, `EmptyState`, `ErrorState`)
- [x] Configure ESLint + Prettier across all workspaces + root `README.md` setup guide
- [x] Pass quality gates: `typecheck`, `lint`, unit tests, Supertest `/health`, RNTL component tests

### Phase 2 — Authentication and Shop Setup
- [ ] Prisma schema & initial migration for `Shop`, `User`, `RefreshSession`, `AuditLog`
- [ ] Argon2id password + PIN hashing, JWT access + hashed rotating refresh tokens
- [ ] Auth routes (`/register`, `/login`, `/pin-login`, `/refresh`, `/logout`, `/pin`, `/me`) + `OWNER`/`EMPLOYEE` RBAC + `shopScope` middleware
- [ ] Shop settings & staff endpoints (`/shop`, `/shop/users`)
- [ ] Mobile `expo-secure-store` token & offline PIN verifier storage, Login / PIN Unlock / Shop Setup screens (Bangla + English)
- [ ] Local Expo SQLite database bootstrap & migration runner (`app_preferences`, schema version table)
- [ ] Tests: Auth, PIN lockout, token rotation, RBAC isolation, mobile auth forms & offline PIN unlock

### Phase 3 — Product and Inventory Management
- [ ] Prisma migration for `Category`, `Unit`, `Product`, `ProductUnit`, `InventoryBalance`, `StockMovement`, `StockAdjustment` + Bangladeshi seed defaults (Pan, Supari, Jorda, standard Bangla units)
- [ ] Backend CRUD + bilingual NFC search (`nameBn`, `nameEn`, barcode), unit conversions, stock alerts, wastage/damage/expiry recording, inventory valuation
- [ ] Mobile SQLite product/unit/inventory mirror + Product list, Product create/edit with unit conversion builder, Stock adjust & Wastage screens
- [ ] Tests: Fractional unit conversions, wastage loss calculations, soft archiving, RNTL product/unit forms

### Phase 4 — Sales and POS
- [ ] Prisma migration for `Sale`, `SaleItem`, `Payment`, `SaleReturn`, `SaleReturnItem`
- [ ] Backend POS transaction engine (server recalculation, split cash/bKash/Nagad payments, credit `বাকি` validation, WAC COGS snapshot, returns & cancellations, idempotency)
- [ ] Mobile POS screen: fast product search, category chips, frequent items, Zustand cart with unit switching & quick weight/quantity presets, checkout sheet (discounts, split payment, customer `বাকি` selection), Bangla receipt view/share
- [ ] Tests: Fractional weight sales, discounts, split payments, credit sales, partial/full returns, idempotency replay, insufficient stock rollback

### Phase 5 — Purchases and Suppliers
- [ ] Prisma migration for `Supplier`, `Purchase`, `PurchaseItem`, `PurchaseReturn`, `SupplierPayment`
- [ ] Backend purchase transactions (multi-item stock restock, Moving WAC recalculation, supplier payable updates, purchase returns, supplier ledger & payments)
- [ ] Mobile Suppliers list, Supplier Ledger, Purchase Entry flow (unit-aware), Supplier Payment screen
- [ ] Tests: Multi-unit purchase WAC recalculation accuracy, supplier payable tracking, purchase return rollback

### Phase 6 — Customers and Expenses
- [ ] Prisma migration for `Customer`, `CustomerPayment`, `ExpenseCategory`, `Expense`, `ExpenseAuditLog`
- [ ] Backend Customer CRUD, Customer Ledger, Due Collection (`CustomerPayment` reducing receivable without creating duplicate revenue), Expense categories, Expenses with `ExpenseAuditLog`
- [ ] Mobile Customers (`বাকি খাতা`), Collect Due flow, Expense list with category/date filters, Add/Edit Expense + audit history viewer
- [ ] Tests: Credit sale -> due collection accounting invariant, expense edit audit trail, filter queries

### Phase 7 — Cashbook and Financial Reporting
- [ ] Prisma migration for `CashbookSession`, `CashbookEntry` (and backfill/link ledger flows cleanly)
- [ ] Backend Daily Cashbook (opening cash, inflows/outflows by Cash/bKash/Nagad, closing count & variance)
- [ ] Backend Reports in `Asia/Dhaka` boundaries: Dashboard KPIs, Daily/Weekly/Monthly Sales, Product Performance, Inventory Valuation, Profit & Loss (accounting for discounts, returns, COGS, wastage, expenses)
- [ ] Mobile Dashboard live cards & 5 Quick Actions, Reports tab, Cashbook Open/Close screen
- [ ] Automated financial reconciliation & P&L verification test suite covering every edge case in `requirements.md` Section 10

### Phase 8 — Offline Synchronization
- [ ] Prisma `SyncOperation` & monotonic `syncSeq` delta support (`POST /sync/push`, `GET /sync/pull`)
- [ ] Mobile SQLite full transactional local writes + `sync_outbox` queue + causal dependency ordering + crash recovery
- [ ] Background/NetInfo sync worker + exponential backoff + Conflict resolution UI (`CONFLICT` inspector) + persistent Sync Status Pill
- [ ] Tests: Offline sale -> restart -> reconnect -> idempotent push -> delta pull, conflict detection & resolution without silent overwrites

### Phase 9 — Production Readiness
- [ ] Comprehensive security audit & index performance review (`EXPLAIN ANALYZE` on ledger/report queries)
- [ ] UTF-8 BOM CSV export & embedded `Noto Sans Bengali` PDF export for reports & receipts
- [ ] Shop JSON Backup Export & Validated Restore workflow
- [ ] App icon, splash screen, Android `app.json`/EAS release config (HTTPS enforcement, clean permissions)
- [ ] Final production documentation (`README.md`, deployment & backup runbook) & release regression suite

---

## 2. Quality Gates Enforced Before Every Phase Completion

1. `npm run typecheck` passes with zero errors (`strict: true`, no unjustified `any`).
2. `npm run lint` passes with zero errors/warnings.
3. All unit, API (Supertest + real test PostgreSQL), and mobile (RNTL) tests pass — no skipped/masked failures.
4. No hardcoded secrets, no leaked stack traces, and all financial calculations verified with `decimal.js` / integer poisha.
5. Phase documentation & Phase Completion Report updated accurately.

---

## 3. Essential Questions to Finalize Before Phase 1

1. **Deployment Tenancy & Registration:** Will this backend serve **one shop (1–2 devices: Owner + optional Employee)** with owner/admin-seeded accounts, or should it allow **multiple independent shops to self-register**? *(All tables include `shopId` either way; this decides registration & onboarding UX.)*
2. **Default Numeral Display in Bangla Mode:** When Bangla (`bn`) is active, should prices and numbers display in **Bangla digits (`৳ ১,২৫০`)** by default or **English digits (`৳ 1,250`)** by default (with a Settings toggle either way)?
3. **Negative Stock & Offline Stock Conflict Policy:** If a shopkeeper tries to sell more than recorded stock (e.g., forgot to log a morning purchase, or two devices sold offline simultaneously), should the app **strictly block** the sale, or **warn and allow** (recording negative stock / flagging an Owner discrepancy alert so real customer sales are never blocked at the counter)?
4. **Employee Permissions (`EMPLOYEE` Role):** Should Employees be permitted to record **credit sales (`বাকি`)** and **apply discounts**, and should **wholesale Cost Price (`ক্রয়মূল্য`) & Profit/Loss** be hidden from Employees (`OWNER`-only)?
