# DokanWala (দোকানওয়ালা) — Security Architecture & Threat Model

> **Mandate:** Security is built into every layer from Phase 1 onward, not bolted on before release.

---

## 1. Authentication & Session Architecture

### 1.1 Dual-Credential Model (Password + Quick PIN)
A Bangladeshi shopkeeper cannot type a complex 12-character password 30 times a day at the counter, yet first-time device setup must be strong:
1. **Primary Login (Phone + Password):**
   - Phone normalized to E.164 Bangladesh format (`+8801XXXXXXXXX`).
   - Password hashed with **Argon2id** (`memoryCost: 65536` [64 MiB], `timeCost: 3`, `parallelism: 1`).
   - Issues short-lived **JWT Access Token (15 min)** signed with HS256/EdDSA secret from environment variables + **Opaque Cryptographic Refresh Token (30 days)**.
2. **Refresh Token Rotation & Revocation:**
   - Only the **SHA-256 hash** of the refresh token is stored in PostgreSQL `RefreshSession(id, userId, tokenHash, deviceId, expiresAt, revokedAt)`.
   - Every `/auth/refresh` call rotates the token and revokes the previous one. Reuse of a revoked refresh token triggers immediate revocation of that session family (theft detection).
3. **Quick PIN Lock / Offline Unlock (4–6 Digits):**
   - After primary login, the user sets a 4–6 digit PIN.
   - Server stores `pinHash` via **Argon2id** for online PIN login (`/auth/pin-login`).
   - On the trusted device, `expo-secure-store` (backed by Android Keystore TEE/StrongBox) stores:
     - `access_token`, `refresh_token`
     - `pin_verifier` (salted cryptographic digest tied to the local user/device) + `pin_failed_attempts`.
   - **Offline Unlock:** When the shopkeeper opens the app offline in the morning, PIN verification succeeds locally against `expo-secure-store` without revealing secrets; 5 consecutive wrong PINs trigger exponential lockout (and after 10 failures wipe local tokens requiring online password login).

---

## 2. Role-Based Access Control (RBAC)

Two initial roles (`OWNER`, `EMPLOYEE`), strictly enforced on **every backend endpoint** via `requireAuth` -> `requireShopScope` -> `requireRole(...)`:

| Capability | `OWNER` | `EMPLOYEE` | Notes / Configurable |
|---|---|---|---|
| POS Checkout (Cash / bKash / Nagad) | Yes | Yes | Core daily counter work |
| Credit Sales (`বাকি`) & Customer Collections | Yes | Configurable (Default: Yes/Limit) | Confirmed in Phase 0 sign-off |
| Apply Sale Discounts | Yes | Configurable / Capped | Prevents unauthorized price cuts |
| View Product Cost Price (`ক্রয়মূল্য`) & Profit/Loss | Yes | **No** (Default) | Protects wholesale margins |
| Sale Cancellation / Void | Yes | **No** | Prevents till skimming |
| Purchases, Suppliers & Wastage/Damage Entry | Yes | **No** (or Stock Count only) | Financial control |
| Edit Expenses / View Audit Logs | Yes | **No** | Cash integrity |
| Shop Settings, Staff Accounts, Backup & Restore | Yes | **No** | Administrative authority |

**Tenant / Shop Isolation Rule:** `req.auth.shopId` comes **exclusively** from the verified JWT/DB user record—never from `req.body.shopId` or `req.params.shopId`. Every Prisma query includes `shopId: req.auth.shopId` (and cross-shop resource lookups return `404 RESOURCE_NOT_FOUND`).

---

## 3. API & Backend Security Controls

1. **Strict Input Validation & Mass-Assignment Prevention:** Every route validates `body`, `query`, and `params` using strict **Zod** schemas (`z.strictObject(...)` or explicit DTO picking) so unknown fields like `role`, `shopId`, `duePoisha`, or `isActive` can never be injected.
2. **SQL Injection Prevention:** All queries use parameterized Prisma ORM methods. Any specialized reporting SQL uses Prisma tagged template literals (`Prisma.sql`), never string concatenation.
3. **HTTP Security Headers & CORS:**
   - `helmet()` enabled with strict defaults (removing `X-Powered-By`).
   - Explicit CORS allowlist via environment config (`CORS_ORIGINS`), never wildcard `*` with credentials in production.
4. **Rate Limiting (`express-rate-limit`):**
   - Auth endpoints (`/auth/login`, `/auth/pin-login`, `/auth/refresh`): strict limit (e.g., 10 requests / 15 min per IP + per phone/account backoff).
   - General API & Sync endpoints: generous operational limit (e.g., 200 req/min per user) so fast POS/sync bursts are never throttled.
5. **Centralized Error Handling & Log Hygiene:**
   - Stack traces, SQL statements, and Prisma schema names are **never** returned in HTTP responses (`NODE_ENV === 'production'`).
   - Pino logger uses `redact: ['req.headers.authorization', '*.password', '*.pin', '*.refreshToken', '*.accessToken']`.

---

## 4. Mobile Application Security Controls

1. **Secure Credential Storage:** All tokens and PIN verifiers live exclusively in **`expo-secure-store`**, never `AsyncStorage` or SQLite plain settings.
2. **Zero Hardcoded Secrets:** Mobile bundle contains only public configuration (`EXPO_PUBLIC_API_URL`); no signing keys, database passwords, or admin tokens.
3. **Production Transport:** Enforce `https://` API base URLs in production release builds (`app.config.ts` / Android `usesCleartextTraffic=false` in release).
4. **Logout Hygiene:** Explicit logout revokes the server refresh token, clears `expo-secure-store`, clears user session state, and protects/resets shop-scoped local data safely (warning if unsynced outbox items remain before switching accounts!).

---

## 5. Financial Security & Integrity

- **Never trust client totals:** Backend recalculates `subtotalPoisha`, `discountPoisha`, `totalPoisha`, `paidPoisha`, `duePoisha`, and `cogsPoisha` inside PostgreSQL transactions.
- **Duplicate payment protection:** All financial mutations require `X-Idempotency-Key` enforced by PostgreSQL unique constraint `(shopId, idempotencyKey)`.
- **Tamper-evident Audit Trail:** `AuditLog` and `ExpenseAuditLog` preserve `actorUserId`, `deviceId`, `action`, `beforeJson`, `afterJson`, and `occurredAt`.

---

## 6. Documented Remaining Risks & Mitigations

No system is 100% invulnerable; the following residual risks are explicitly acknowledged:

| Residual Risk | Impact | Mitigation in Scope | Future Hardening Option |
|---|---|---|---|
| **Local SQLite unencrypted at rest on rooted Android** | Physical attacker with root shell could read offline sales/customer names | No passwords/tokens in SQLite (kept in Android Keystore via `SecureStore`); wipe tokens on PIN brute-force | SQLCipher encrypted SQLite build via custom Expo dev client |
| **Offline price manipulation on a compromised Employee device** | Tampered client could submit lowered unit price while offline | Offline price variances flagged in `AuditLog` (`OFFLINE_PRICE_VARIANCE`) + Owner discrepancy report + optional strict price lock setting | Hardware device attestation (Play Integrity API) |
| **Shared single-phone usage (Owner leaves app unlocked)** | Cashier could access Owner profit reports | Auto-lock idle timeout (configurable, e.g., 5 min) requiring Quick PIN; role switch requires PIN | Biometric prompt (`expo-local-authentication`) |
| **Loss of phone with unsynced offline data** | Unsynced transactions lost if device destroyed before syncing | Frequent opportunistic sync + visible `Pending Sync` warning pill + manual local backup export | Peer-to-peer local backup / automatic background work manager |
