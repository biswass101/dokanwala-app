# DokanWala (দোকানওয়ালা)

Smart Grocery & Pan-Supari Shop Management Mobile Application for Bangladesh — built with **Bangla-first UX**, **offline-first SQLite synchronization**, and **decimal-safe BDT (`৳`) accounting**.

---

## Project Structure

- `packages/shared/` — Pure TypeScript financial math (`integer poisha` + `decimal.js`), Bangla digit/currency formatters, unit conversion helpers, error codes, and shared API/backup contracts.
- `backend/` — Node.js + Express 5 + TypeScript + Prisma + PostgreSQL API server, including UTF-8 BOM CSV exports, embedded `Noto Sans Bengali` PDF receipts/reports (`pdfkit`), and SHA-256 verified JSON backups.
- `mobile/` — React Native + Expo SDK 58 + Expo Router + NativeWind + `i18next` (`bn`/`en`) + `Noto Sans Bengali` + EAS release configuration (`app.json`, `eas.json`, `assets/`).
- `docs/` — Architecture, ERD, API conventions, offline sync protocol, security architecture, design system, roadmap, and [Production Deployment Runbook](./docs/08-production-deployment-runbook.md).

---

## Prerequisites

- **Node.js** `>= 22` (verified on `v24.20.0`) & **npm** `>= 10`
- **Docker & Docker Compose** (for PostgreSQL 16 dev & test containers)
- **Expo Go** on Android (or Android emulator / web browser for preview)

---

## Local Setup & Running

### 1. Start PostgreSQL Databases
```bash
docker compose up -d
```
- Dev DB runs on host port `5433` (`dokanwala_dev`)
- Test DB runs on host port `5434` (`dokanwala_test`, ephemeral `tmpfs`)

### 2. Install Dependencies & Build Shared Package
```bash
npm install
npm run build:shared
```

### 3. Configure Environment & Run Database Migrations
```bash
cp backend/.env.example backend/.env
cp mobile/.env.example mobile/.env

npm --workspace=backend run prisma:generate
npm --workspace=backend run prisma:migrate
```
*(When testing on a physical Android phone via Expo Go, update `EXPO_PUBLIC_API_URL` in `mobile/.env` to your machine's LAN IP, e.g. `http://192.168.1.50:4000/api/v1`. Production builds enforce `https://`.)*

### 4. Start Backend & Mobile App
```bash
# Terminal 1: Start Express API (http://localhost:4000/api/v1/health)
npm run dev:backend

# Terminal 2: Start Expo Metro bundler
npm run dev:mobile
```

---

## Key Production Features

- **Reports CSV & Bangla PDF Exports:** Export Daily/Weekly/Monthly Sales, Product Performance, Profit & Loss (`OWNER`-only), and Customer/Supplier Dues from the Reports tab with Excel-safe UTF-8 BOM CSV and bundled `Noto Sans Bengali` PDFs.
- **POS Receipt PDF & Printing:** Download, share, or print 80mm thermal PDF receipts directly from the Receipt screen.
- **Owner JSON Backup & Validated Restore:** Download full shop snapshots protected by canonical SHA-256 checksums and atomically restore them from **More → Shop Backup & Restore (JSON)**.
- **Production Security & Performance:** Strict production secret & CORS startup validation, reverse-proxy `TRUST_PROXY`, sanitized Prisma error codes, HTTPS-enforced mobile client, and composite PostgreSQL indexes verified with `EXPLAIN ANALYZE`.

See [`docs/08-production-deployment-runbook.md`](./docs/08-production-deployment-runbook.md) for deployment, EAS build (`APK`/`AAB`), migration, and recovery instructions.

---

## Quality Gates & Testing

```bash
npm run typecheck    # Builds shared & runs strict TypeScript check across all workspaces
npm run lint         # ESLint across shared, backend, and mobile (0 warnings/errors)
npm run test         # Vitest (shared + backend Supertest/Postgres) + Jest (mobile RNTL)
```
